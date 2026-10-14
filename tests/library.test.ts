import test from "node:test";
import assert from "node:assert/strict";
import {
  scenarioCourses,
  courseUnits,
  getCourseUnit,
} from "../web/scenario/catalogue.ts";
import { plainJapanese } from "../web/scenario/content.ts";
import {
  newScenarioProgress,
  answerMeaning,
  visitStage,
  unlockedStage,
  parseScenarioProgress,
  meaningScore,
} from "../web/scenario/progress.ts";
import {
  newLibrary,
  updateCourse,
  parseLibrary,
  recommendedCourse,
  recommendedPractice,
  startFocus,
  finishFocus,
  focusReady,
} from "../web/scenario/library.ts";

function completeCourse(index = 0, count = 0) {
  const course = scenarioCourses[index];
  let progress = newScenarioProgress(count, course.id);
  progress.heard = true;
  for (const question of course.listeningQuestions)
    progress = answerMeaning(progress, question.id, question.correct);
  assert.equal(unlockedStage(progress), 1);
  progress.expressionsDone = true;
  for (const prompt of [...course.responsePrompts, course.transferPrompt])
    progress.speaking[prompt.id] = {
      triedFirst: true,
      revealed: true,
      rating: "independent",
    };
  for (const question of course.readingQuestions)
    progress = answerMeaning(progress, question.id, question.correct);
  return visitStage(progress, 5);
}

test("all twelve courses have complete content and independent stage/score rules", () => {
  assert.equal(scenarioCourses.length, 12);
  assert.equal(new Set(scenarioCourses.map((c) => c.id)).size, 12);
  scenarioCourses.forEach((course, index) => {
    assert.equal(course.dialogue.length, index < 4 ? 4 : 6);
    assert.equal(course.expressions.length, 4);
    assert.equal(course.responsePrompts.length, index < 4 ? 2 : 3);
    const questions = [
      ...course.listeningQuestions,
      ...course.readingQuestions,
    ];
    assert.equal(questions.length, 5);
    assert.equal(new Set(questions.map((q) => q.id)).size, questions.length);
    for (const q of questions) {
      assert.ok(
        Number.isInteger(q.correct) &&
          q.correct >= 0 &&
          q.correct < q.options.length,
      );
      assert.equal(new Set(q.options).size, q.options.length);
      assert.ok(q.explanation && q.prompt);
    }
    const prompts = [...course.responsePrompts, course.transferPrompt];
    assert.equal(new Set(prompts.map((p) => p.id)).size, prompts.length);
    assert.ok(
      prompts.every((p) => p.references.length >= 2 && p.goals.length >= 2),
    );
    for (const line of [
      ...course.dialogue.map((d) => d.line),
      ...course.expressions.map((e) => e.line),
      ...prompts.flatMap((p) => p.references),
      ...prompts.flatMap((p) => (p.cue ? [p.cue] : [])),
      course.readingMessage,
    ]) {
      assert.ok(plainJapanese(line) && line.romaji && line.translation);
      assert.ok(
        line.parts.every(
          (part) => typeof part === "string" || (part.text && part.reading),
        ),
      );
    }
    const progress = completeCourse(index);
    assert.equal(progress.completedRuns, 1);
    assert.equal(meaningScore(progress, "listening").correct, 3);
    assert.equal(meaningScore(progress, "reading").correct, 2);
    assert.deepEqual(
      parseScenarioProgress(JSON.stringify(progress), course.id),
      progress,
    );
  });
});

test("curriculum covers each course once and links only to earlier lessons", () => {
  assert.equal(courseUnits.length, 3);
  for (const unit of courseUnits) {
    assert.equal(unit.courses.length, 4);
    for (const course of unit.courses)
      assert.equal(getCourseUnit(course.id), unit);
  }
  assert.deepEqual(
    scenarioCourses.slice(0, 4).map((course) => course.id),
    [
      "dinner-invitation-v1",
      "cafe-order-v1",
      "asking-directions-v1",
      "clothes-shopping-v1",
    ],
  );
  for (const course of scenarioCourses.slice(4)) {
    const priorIndex = scenarioCourses.findIndex(
      (prior) => prior.id === course.buildsOn,
    );
    assert.ok(priorIndex >= 0 && priorIndex < scenarioCourses.indexOf(course));
  }
});

test("an existing four-course v2 library grows without replacing current work or history", () => {
  let old = newLibrary();
  for (let index = 0; index < 4; index++)
    old = updateCourse(
      old,
      scenarioCourses[index].id,
      completeCourse(index, index),
    );
  old = startFocus(old, { lessonId: scenarioCourses[1].id, skill: "reading" });
  const question = scenarioCourses[1].readingQuestions[0];
  old.focus!.progress = answerMeaning(
    old.focus!.progress,
    question.id,
    question.correct,
  );
  const originalFour = Object.fromEntries(
    scenarioCourses
      .slice(0, 4)
      .map((course) => [course.id, old.courses[course.id]]),
  );
  const restored = parseLibrary(
    JSON.stringify({ ...old, courses: originalFour }),
    null,
  );
  assert.equal(Object.keys(restored.courses).length, 12);
  for (const course of scenarioCourses.slice(0, 4))
    assert.deepEqual(restored.courses[course.id], originalFour[course.id]);
  for (const course of scenarioCourses.slice(4))
    assert.deepEqual(
      restored.courses[course.id],
      newScenarioProgress(0, course.id),
    );
  assert.deepEqual(restored.attempts, old.attempts);
  assert.deepEqual(restored.focus, old.focus);
  assert.equal(restored.selectedId, old.selectedId);
  assert.equal(recommendedCourse(restored), scenarioCourses[4].id);
});

test("every new lesson requires the third response before advancing and preserves it on reload", () => {
  for (let index = 4; index < scenarioCourses.length; index++) {
    const course = scenarioCourses[index];
    const progress = completeCourse(index);
    const third = course.responsePrompts[2];
    delete progress.speaking[third.id];
    progress.completedAt = null;
    progress.completedRuns = 0;
    progress.stage = 2;
    assert.equal(unlockedStage(progress), 2);
    assert.strictEqual(visitStage(progress, 3), progress);
    progress.speaking[third.id] = {
      triedFirst: false,
      revealed: true,
      rating: "assisted",
    };
    assert.equal(unlockedStage(progress), 5);
    assert.deepEqual(
      parseScenarioProgress(JSON.stringify(progress), course.id),
      progress,
    );
  }
});

test("v1 migration keeps the available round and cumulative count without inventing earlier attempts", () => {
  const pilot = completeCourse(0, 3);
  pilot.speaking[scenarioCourses[0].responsePrompts[1].id].rating = "assisted";
  const raw = JSON.stringify(pilot);
  const library = parseLibrary(null, raw);
  assert.deepEqual(library.courses[pilot.lessonId], pilot);
  assert.equal(library.attempts.length, 1);
  assert.equal(library.attempts[0].completedAt, pilot.completedAt);
  assert.equal(library.courses[pilot.lessonId].completedRuns, 4);
  assert.equal(recommendedCourse(library), scenarioCourses[1].id);
  assert.deepEqual(
    library.courses[scenarioCourses[1].id],
    newScenarioProgress(0, scenarioCourses[1].id),
  );
  assert.deepEqual(parseLibrary(JSON.stringify(library), raw), library);
  assert.deepEqual(parseLibrary("{broken", raw), library);
});

test("switching and replaying courses preserves separate progress and immutable attempt history", () => {
  let library = newLibrary();
  const pilot = completeCourse();
  library = updateCourse(library, pilot.lessonId, pilot);
  library = updateCourse(library, pilot.lessonId, visitStage(pilot, 5));
  assert.equal(library.attempts.length, 1);
  const cafe = scenarioCourses[1];
  const partial = answerMeaning(
    library.courses[cafe.id],
    cafe.listeningQuestions[0].id,
    0,
  );
  library = updateCourse(library, cafe.id, partial);
  assert.equal(recommendedCourse(library), cafe.id);
  assert.deepEqual(library.courses[pilot.lessonId], pilot);
  assert.strictEqual(updateCourse(library, cafe.id, pilot), library);
  library = updateCourse(library, pilot.lessonId, newScenarioProgress(1));
  assert.deepEqual(library.attempts[0].progress, pilot);
  library = updateCourse(library, pilot.lessonId, completeCourse(0, 1));
  assert.equal(library.attempts.length, 2);
  assert.equal(library.attempts[0].progress.completedRuns, 1);
  assert.equal(library.attempts[1].progress.completedRuns, 2);
  assert.deepEqual(library.courses[cafe.id], partial);
  assert.deepEqual(parseLibrary(JSON.stringify(library), null), library);
});

test("focused speaking is resumable and updates suggestions without rewriting completed lessons", () => {
  const course = scenarioCourses[0];
  const full = completeCourse();
  full.speaking[course.responsePrompts[1].id].rating = "assisted";
  full.speaking[course.transferPrompt.id].rating = "again";
  let library = updateCourse(newLibrary(), course.id, full);
  const target = recommendedPractice(library);
  assert.equal(target.promptId, course.responsePrompts[1].id);
  library = startFocus(library, target);
  assert.equal(focusReady(library.focus!), false);
  assert.strictEqual(finishFocus(library), library);
  assert.strictEqual(
    startFocus(library, { lessonId: course.id, skill: "reading" }),
    library,
  );
  assert.deepEqual(
    parseLibrary(JSON.stringify(library), null).focus,
    library.focus,
  );
  library.focus!.progress.speaking[target.promptId!] = {
    triedFirst: true,
    revealed: true,
    rating: "independent",
  };
  library = finishFocus(library);
  assert.equal(library.focus, null);
  assert.equal(library.attempts.length, 2);
  assert.equal(library.attempts[1].kind, "focus");
  assert.equal(recommendedPractice(library).promptId, course.transferPrompt.id);
  assert.deepEqual(library.courses[course.id], full);
  assert.deepEqual(library.attempts[0].progress, full);
  assert.deepEqual(parseLibrary(JSON.stringify(library), null), library);
});

test("focused comprehension stores its own aids and first answers", () => {
  for (const skill of ["listening", "reading"] as const) {
    const course = scenarioCourses[2];
    let library = startFocus(newLibrary(), { lessonId: course.id, skill });
    const questions =
      skill === "reading" ? course.readingQuestions : course.listeningQuestions;
    for (const question of questions)
      library.focus!.progress = answerMeaning(
        library.focus!.progress,
        question.id,
        question.correct,
      );
    assert.equal(focusReady(library.focus!), true);
    library = finishFocus(library);
    assert.equal(library.courses[course.id].completedRuns, 0);
    assert.equal(library.attempts[0].progress.completedRuns, 0);
    assert.equal(
      meaningScore(library.attempts[0].progress, skill).correct,
      questions.length,
    );
    assert.equal(
      meaningScore(library.attempts[0].progress, skill).independent,
      skill === "listening" ? 0 : questions.length,
    );
    assert.deepEqual(parseLibrary(JSON.stringify(library), null), library);
  }
});

test("corrupted multi-course data cannot import a different course's progress or unlock history", () => {
  const library = newLibrary();
  const pilot = completeCourse();
  const restored = parseLibrary(
    JSON.stringify({
      ...library,
      selectedId: "missing",
      courses: { [scenarioCourses[1].id]: pilot },
      attempts: [
        null,
        {
          kind: "lesson",
          lessonId: pilot.lessonId,
          completedAt: pilot.completedAt,
          progress: newScenarioProgress(),
        },
      ],
      focus: {
        lessonId: pilot.lessonId,
        skill: "speaking",
        promptId: "missing",
        progress: pilot,
      },
    }),
    null,
  );
  assert.deepEqual(restored, library);
});
