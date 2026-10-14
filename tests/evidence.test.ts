import test from "node:test";
import assert from "node:assert/strict";
import { scenarioCourses } from "../web/scenario/catalogue.ts";
import { buildPracticeEvidence, dimensions } from "../web/scenario/evidence.ts";
import { newLibrary, type SavedAttempt } from "../web/scenario/library.ts";
import {
  newScenarioProgress,
  answerMeaning,
} from "../web/scenario/progress.ts";

const now = Date.parse("2026-10-14T04:00:00Z");
function attempt(courseIndex = 0, daysAgo = 0): SavedAttempt {
  const course = scenarioCourses[courseIndex];
  let progress = newScenarioProgress(1, course.id);
  progress.heard = true;
  progress.expressionsDone = true;
  for (const question of [
    ...course.listeningQuestions,
    ...course.readingQuestions,
  ])
    progress = answerMeaning(progress, question.id, question.correct);
  for (const prompt of [...course.responsePrompts, course.transferPrompt])
    progress.speaking[prompt.id] = {
      triedFirst: true,
      revealed: true,
      rating: "independent",
    };
  const completedAt = new Date(now - daysAgo * 86400000).toISOString();
  progress.completedAt = completedAt;
  progress.stage = 5;
  return {
    kind: "lesson",
    lessonId: course.id,
    skill: "speaking",
    completedAt,
    progress,
  };
}

test("empty and in-progress work has missing evidence, not a zero score", () => {
  const library = newLibrary();
  library.courses[scenarioCourses[0].id] = attempt().progress;
  const result = buildPracticeEvidence(library, "all", now);
  assert.equal(result.attemptCount, 0);
  for (const id of dimensions) {
    assert.equal(result.dimensions[id].percent, null);
    assert.equal(result.dimensions[id].target, null);
  }
});

test("full lessons include all four dimensions and do not equate assisted success with failure", () => {
  const saved = attempt();
  const course = scenarioCourses[0];
  saved.progress.answers[course.listeningQuestions[0].id] = {
    choice: course.listeningQuestions[0].correct,
    independent: false,
    supports: ["slow", "transcript"],
  };
  saved.progress.speaking[course.responsePrompts[0].id].rating = "assisted";
  saved.progress.speaking[course.transferPrompt.id].rating = "again";
  const library = { ...newLibrary(), attempts: [saved] };
  const before = structuredClone(library);
  const result = buildPracticeEvidence(library, "recent", now);
  const listening = result.dimensions.listening;
  assert.equal(listening.correct, 3);
  assert.equal(listening.independent, 2);
  assert.equal(listening.percent, 67);
  assert.deepEqual(listening.supportCounts, { slow: 1, transcript: 1 });
  assert.equal(result.dimensions.response.percent, 50);
  assert.equal(result.dimensions.response.assisted, 1);
  assert.equal(result.dimensions.transfer.percent, 0);
  assert.equal(result.dimensions.transfer.again, 1);
  assert.equal(result.dimensions.reading.percent, 100);
  assert.equal(result.courseCount, 1);
  assert.deepEqual(library, before);
});

test("latest item results use timestamps, stable ties and focused targets, not inflated repeated averages", () => {
  const old = attempt(0, 3);
  const repeated = attempt(0, 2);
  const course = scenarioCourses[0];
  repeated.progress.speaking[course.responsePrompts[0].id].rating = "again";
  const focus: SavedAttempt = {
    ...attempt(),
    kind: "focus",
    skill: "speaking",
    promptId: course.transferPrompt.id,
  };
  focus.progress.speaking[course.transferPrompt.id].rating = "assisted";
  // An unrelated field in a focused snapshot must never be treated as another completed skill.
  focus.progress.speaking[course.responsePrompts[0].id].rating = "independent";
  const library = { ...newLibrary(), attempts: [focus, old, repeated] };
  const result = buildPracticeEvidence(library, "all", now);
  assert.equal(result.attemptCount, 3);
  assert.equal(result.courseCount, 1);
  assert.equal(result.dimensions.listening.items.length, 3);
  assert.equal(result.dimensions.listening.attemptCount, 2);
  assert.equal(result.dimensions.response.percent, 50);
  assert.equal(
    result.dimensions.response.target?.promptId,
    course.responsePrompts[0].id,
  );
  assert.equal(result.dimensions.transfer.items.length, 1);
  assert.equal(result.dimensions.transfer.attemptCount, 3);
  assert.equal(result.dimensions.transfer.assisted, 1);
  assert.equal(result.dimensions.transfer.items[0].attemptIndex, 0);
  const tied = structuredClone(focus);
  tied.progress.speaking[course.transferPrompt.id].rating = "independent";
  assert.equal(
    buildPracticeEvidence(
      { ...library, attempts: [...library.attempts, tied] },
      "all",
      now,
    ).dimensions.transfer.percent,
    100,
  );
});

test("focused listening and reading update only their skill and retain source snapshots", () => {
  const full = attempt(0, 3);
  const listening: SavedAttempt = {
    ...attempt(0, 1),
    kind: "focus",
    skill: "listening",
  };
  const reading: SavedAttempt = {
    ...attempt(),
    kind: "focus",
    skill: "reading",
  };
  const q = scenarioCourses[0].listeningQuestions[0];
  listening.progress.answers[q.id].choice = (q.correct + 1) % q.options.length;
  const readQ = scenarioCourses[0].readingQuestions[0];
  reading.progress.answers[readQ.id].independent = false;
  reading.progress.answers[readQ.id].supports = ["translation"];
  const result = buildPracticeEvidence(
    { ...newLibrary(), attempts: [full, listening, reading] },
    "all",
    now,
  );
  assert.equal(result.dimensions.listening.correct, 2);
  assert.equal(result.dimensions.listening.percent, 67);
  assert.equal(result.dimensions.reading.correct, 2);
  assert.equal(result.dimensions.reading.percent, 50);
  assert.equal(result.dimensions.response.percent, 100);
  assert.equal(result.dimensions.response.attemptCount, 1);
  assert.equal(result.dimensions.listening.items[0].attemptIndex, 1);
  assert.equal(full.progress.answers[q.id].choice, q.correct);
});

test("text-only comprehension does not become listening evidence or erase older audio practice", () => {
  const text = attempt();
  text.progress.heard = false;
  const library = { ...newLibrary(), attempts: [text] };
  const empty = buildPracticeEvidence(library, "all", now);
  assert.equal(empty.textOnlyCount, 1);
  assert.equal(empty.dimensions.listening.percent, null);
  assert.equal(empty.dimensions.reading.percent, 100);
  const result = buildPracticeEvidence(
    { ...library, attempts: [attempt(0, 1), text] },
    "all",
    now,
  );
  assert.equal(result.dimensions.listening.attemptCount, 1);
  assert.equal(result.dimensions.listening.items[0].attemptIndex, 0);
});

test("recent window excludes old, future and invalid dates; all keeps older evidence without fabricating history", () => {
  const old = attempt(0, 31);
  const boundary = attempt(1, 30);
  const future = attempt(2, -1);
  const invalid = { ...attempt(3), completedAt: "invalid" };
  const library = {
    ...newLibrary(),
    attempts: [old, boundary, future, invalid],
  };
  library.courses[old.lessonId].completedRuns = 70;
  const recent = buildPracticeEvidence(library, "recent", now);
  assert.equal(recent.attemptCount, 1);
  assert.equal(
    recent.dimensions.listening.items[0].target.lessonId,
    boundary.lessonId,
  );
  assert.equal(buildPracticeEvidence(library, "all", now).attemptCount, 2);
});

test("old records preserve independent results but do not invent per-question support details", () => {
  const old = attempt();
  old.progress.supports.listening = ["translation"];
  for (const q of scenarioCourses[0].listeningQuestions)
    delete old.progress.answers[q.id].supports;
  const result = buildPracticeEvidence(
    { ...newLibrary(), attempts: [old] },
    "all",
    now,
  ).dimensions.listening;
  assert.equal(result.unknownSupports, 3);
  assert.deepEqual(result.supportCounts, {});
  assert.equal(result.independent, 3);
});

test("retry picks an incorrect item before assisted success and all-independent evidence picks the oldest", () => {
  const assisted = attempt(0, 3);
  for (const q of scenarioCourses[0].readingQuestions)
    assisted.progress.answers[q.id].independent = false;
  const incorrect = attempt(1, 1);
  const q = scenarioCourses[1].readingQuestions[1];
  incorrect.progress.answers[q.id].choice = (q.correct + 1) % q.options.length;
  const result = buildPracticeEvidence(
    { ...newLibrary(), attempts: [assisted, incorrect] },
    "all",
    now,
  );
  assert.equal(result.dimensions.reading.target?.lessonId, incorrect.lessonId);
  assert.equal(result.dimensions.listening.target?.lessonId, assisted.lessonId);
  assert.equal(result.dimensions.reading.courseCount, 2);
});
