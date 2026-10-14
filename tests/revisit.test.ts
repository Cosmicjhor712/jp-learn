import test from "node:test";
import assert from "node:assert/strict";
import { scenarioCourses, getScenario } from "../web/scenario/catalogue.ts";
import { scenarioVariants, getVariant } from "../web/scenario/variants.ts";
import { plainJapanese } from "../web/scenario/content.ts";
import {
  newScenarioProgress,
  answerMeaning,
  type ScenarioProgress,
} from "../web/scenario/progress.ts";
import {
  newLibrary,
  parseLibrary,
  updateCourse,
  startFocus,
  type LearningLibrary,
} from "../web/scenario/library.ts";
import {
  startRevisit,
  finishRevisit,
  revisitPlans,
  revisitReady,
  revisitIndependent,
  revisitUnlockedStep,
  noteExposure,
} from "../web/scenario/revisit.ts";
import { buildPracticeEvidence } from "../web/scenario/evidence.ts";

const epoch = Date.parse("2026-10-01T04:00:00Z");
const day = 86400000;
function complete(id: string, at = epoch): ScenarioProgress {
  const course = getScenario(id);
  let progress = {
    ...newScenarioProgress(0, id),
    heard: true,
    expressionsDone: true,
  };
  for (const q of [...course.listeningQuestions, ...course.readingQuestions])
    progress = answerMeaning(progress, q.id, q.correct);
  for (const p of [...course.responsePrompts, course.transferPrompt])
    progress.speaking[p.id] = {
      triedFirst: true,
      revealed: true,
      rating: "independent",
    };
  return {
    ...progress,
    completedAt: new Date(at).toISOString(),
    completedRuns: 1,
    stage: 5,
  };
}
function learned(index = 0): LearningLibrary {
  return updateCourse(
    newLibrary(),
    scenarioCourses[index].id,
    complete(scenarioCourses[index].id),
  );
}
function finish(library: LearningLibrary, at: number, independent = true) {
  assert.ok(library.revisit);
  const progress = complete(library.revisit.variantId, at);
  progress.completedRuns = 0;
  if (!independent)
    progress.speaking[getScenario(progress.lessonId).transferPrompt.id].rating =
      "assisted";
  return finishRevisit(
    { ...library, revisit: { ...library.revisit, step: 3, progress } },
    at,
  );
}

test("all 12 scenarios have distinct, versioned and complete variants without changing the main catalogue", () => {
  assert.equal(scenarioCourses.length, 12);
  assert.equal(scenarioVariants.length, 12);
  const ids = new Set<string>();
  for (const course of scenarioCourses) {
    const variant = getVariant(course.id)!;
    assert.ok(
      variant && variant.baseId === course.id && variant.contentVersion === 1,
    );
    assert.equal(getScenario(variant.id), variant);
    assert.equal(variant.expressions.length, 0);
    assert.equal(variant.dialogue.length, 4);
    assert.equal(variant.listeningQuestions.length, 2);
    assert.equal(variant.readingQuestions.length, 2);
    assert.equal(variant.responsePrompts.length, 1);
    assert.notEqual(
      plainJapanese(variant.readingMessage),
      plainJapanese(course.readingMessage),
    );
    for (const q of [
      ...variant.listeningQuestions,
      ...variant.readingQuestions,
    ]) {
      assert.ok(!ids.has(q.id));
      ids.add(q.id);
      assert.equal(q.options.length, 3);
      assert.equal(new Set(q.options).size, 3);
      assert.ok(q.correct >= 0 && q.correct < 3 && q.explanation && q.prompt);
    }
    for (const p of [...variant.responsePrompts, variant.transferPrompt]) {
      assert.ok(!ids.has(p.id));
      ids.add(p.id);
      assert.ok(p.references.length >= 2 && p.goals.length >= 2 && p.context);
    }
    for (const value of [
      ...variant.dialogue.map((d) => d.line),
      variant.readingMessage,
      ...[...variant.responsePrompts, variant.transferPrompt].flatMap(
        (p) => p.references,
      ),
    ])
      assert.ok(plainJapanese(value) && value.romaji && value.translation);
    assert.ok(
      revisitReady(complete(variant.id)) &&
        revisitIndependent(complete(variant.id)),
    );
  }
});

test("first review waits a full 24 hours, including around local midnight, and ignores future completions", () => {
  const library = learned();
  assert.equal(revisitPlans(newLibrary(), epoch).length, 0);
  assert.equal(revisitPlans(library, epoch - 1).length, 0);
  assert.equal(revisitPlans(library, epoch + day - 1)[0].due, false);
  assert.equal(revisitPlans(library, epoch + day)[0].due, true);
  assert.equal(revisitPlans(library, epoch + day)[0].intervalDays, 1);
  assert.equal(
    startRevisit(library, scenarioCourses[0].id, epoch + 1000).revisit?.mode,
    "practice",
  );
  assert.equal(
    startRevisit(library, scenarioCourses[0].id, epoch + day).revisit?.mode,
    "delayed",
  );
});

test("delayed independent attempts extend 1/3/7/14-day intervals; assisted work resets to one day", () => {
  let library = learned();
  const baseId = scenarioCourses[0].id;
  const original = structuredClone(library.courses);
  let now = epoch;
  for (const interval of [3, 7, 14, 14]) {
    now = Date.parse(revisitPlans(library, now)[0].dueAt);
    library = finish(startRevisit(library, baseId, now), now + 60000);
    now += 60000;
    assert.equal(revisitPlans(library, now)[0].intervalDays, interval);
    assert.equal(library.attempts.at(-1)?.revisit?.mode, "delayed");
    library = parseLibrary(JSON.stringify(library), null);
  }
  now = Date.parse(revisitPlans(library, now)[0].dueAt);
  library = finish(startRevisit(library, baseId, now), now + 60000, false);
  const plan = revisitPlans(library, now + 60000)[0];
  assert.equal(plan.intervalDays, 1);
  assert.equal(plan.delayedRuns, 5);
  assert.equal(plan.variantRuns, 5);
  assert.deepEqual(library.courses, original);
  assert.equal(finishRevisit(library, now + 60000), library);
});

test("early practice never becomes delayed by waiting mid-session and postpones the next review", () => {
  const library = startRevisit(
    learned(),
    scenarioCourses[0].id,
    epoch + day / 2,
  );
  const finished = finish(library, epoch + 2 * day);
  assert.equal(finished.attempts.at(-1)?.revisit?.mode, "practice");
  const plan = revisitPlans(finished, epoch + 2 * day)[0];
  assert.equal(plan.delayedRuns, 0);
  assert.equal(plan.intervalDays, 1);
  assert.equal(plan.dueAt, new Date(epoch + 3 * day).toISOString());
});

test("an assisted early variant shortens an established interval without adding a delayed success", () => {
  let library = finish(
    startRevisit(learned(), scenarioCourses[0].id, epoch + day),
    epoch + day + 1000,
  );
  assert.equal(revisitPlans(library, epoch + day + 1000)[0].intervalDays, 3);
  library = finish(
    startRevisit(library, scenarioCourses[0].id, epoch + 2 * day),
    epoch + 2 * day + 1000,
    false,
  );
  assert.equal(
    revisitPlans(library, epoch + 2 * day + 1000)[0].intervalDays,
    1,
  );
  assert.equal(revisitPlans(library, epoch + 2 * day + 1000)[0].delayedRuns, 1);
});

test("viewing old material resets the clock and disqualifies an already-started delayed attempt", () => {
  let library = learned();
  library = noteExposure(library, scenarioCourses[0].id, epoch + day);
  assert.equal(
    revisitPlans(library, epoch + day)[0].dueAt,
    new Date(epoch + 2 * day).toISOString(),
  );
  library = startRevisit(library, scenarioCourses[0].id, epoch + 2 * day);
  library = noteExposure(
    library,
    library.revisit!.variantId,
    epoch + 2 * day + 60000,
  );
  const finished = finish(library, epoch + 2 * day + 120000);
  assert.equal(finished.attempts.at(-1)?.revisit?.mode, "practice");
  assert.equal(
    revisitPlans(finished, epoch + 2 * day + 120000)[0].delayedRuns,
    0,
  );
  assert.deepEqual(
    parseLibrary(JSON.stringify(finished), null).exposures,
    finished.exposures,
  );
});

test("completed focused practice delays a review and unrelated courses do not change its schedule", () => {
  let library = learned();
  library.attempts.push({
    kind: "focus",
    lessonId: scenarioCourses[0].id,
    skill: "reading",
    progress: complete(scenarioCourses[0].id, epoch + day),
    completedAt: new Date(epoch + day).toISOString(),
  });
  library = updateCourse(
    library,
    scenarioCourses[1].id,
    complete(scenarioCourses[1].id, epoch + 2 * day),
  );
  const plans = revisitPlans(library, epoch + 2 * day);
  assert.equal(plans[0].baseId, scenarioCourses[0].id);
  assert.equal(plans[0].dueAt, new Date(epoch + 2 * day).toISOString());
  assert.equal(plans[1].due, false);
});

test("unfinished review and focused work cannot overwrite each other, and progress resumes safely", () => {
  const library = startRevisit(learned(), scenarioCourses[0].id, epoch + day);
  const variant = getVariant(scenarioCourses[0].id)!;
  const run = library.revisit!;
  run.progress.heard = true;
  for (const q of variant.listeningQuestions)
    run.progress = answerMeaning(run.progress, q.id, q.correct);
  run.step = 1;
  assert.equal(revisitUnlockedStep(run.progress), 1);
  assert.equal(finishRevisit(library, epoch + day + 1000), library);
  assert.equal(
    startRevisit(library, scenarioCourses[1].id, epoch + day),
    library,
  );
  assert.equal(
    startFocus(library, { lessonId: scenarioCourses[0].id, skill: "reading" }),
    library,
  );
  assert.deepEqual(parseLibrary(JSON.stringify(library), null).revisit, run);
  const focus = startFocus(learned(), {
    lessonId: scenarioCourses[0].id,
    skill: "reading",
  });
  assert.equal(startRevisit(focus, scenarioCourses[0].id, epoch + day), focus);
});

test("no audio, wrong comprehension, or assisted expression cannot extend the delay", () => {
  const variant = getVariant(scenarioCourses[0].id)!;
  const progress = complete(variant.id);
  progress.heard = false;
  assert.equal(revisitIndependent(progress), false);
  progress.heard = true;
  progress.answers[variant.readingQuestions[0].id].choice =
    (variant.readingQuestions[0].correct + 1) % 3;
  assert.equal(revisitIndependent(progress), false);
});

test("v2 upgrade keeps prior records and rejects mismatched version, target, stage and pending progress", () => {
  const original = learned();
  const old = JSON.parse(JSON.stringify(original));
  delete old.revisit;
  delete old.exposures;
  assert.deepEqual(parseLibrary(JSON.stringify(old), null), original);
  const pending = startRevisit(original, scenarioCourses[0].id, epoch + day);
  pending.revisit!.step = 999;
  assert.equal(parseLibrary(JSON.stringify(pending), null).revisit?.step, 0);
  pending.revisit!.contentVersion = 2 as 1;
  assert.equal(parseLibrary(JSON.stringify(pending), null).revisit, null);
  const finished = finish(
    startRevisit(original, scenarioCourses[0].id, epoch + day),
    epoch + day + 1000,
  );
  const invalid = structuredClone(finished);
  invalid.attempts[1].revisit!.baseId = scenarioCourses[1].id;
  assert.equal(parseLibrary(JSON.stringify(invalid), null).attempts.length, 1);
  const badProgress = startRevisit(
    original,
    scenarioCourses[0].id,
    epoch + day,
  );
  badProgress.revisit!.progress = complete(scenarioCourses[0].id);
  assert.equal(parseLibrary(JSON.stringify(badProgress), null).revisit, null);
});

test("radar keeps original, variant and delayed sources separate with unchanged historical snapshots", () => {
  const original = learned();
  const early = finish(
    startRevisit(original, scenarioCourses[0].id, epoch + 1000),
    epoch + 2000,
    false,
  );
  const now = epoch + day + 2000;
  const library = finish(
    startRevisit(early, scenarioCourses[0].id, now),
    now + 1000,
  );
  assert.equal(
    buildPracticeEvidence(library, "all", now + 1000).attemptCount,
    1,
  );
  const variants = buildPracticeEvidence(library, "all", now + 1000, "variant");
  assert.equal(variants.attemptCount, 2);
  assert.equal(variants.courseCount, 1);
  assert.equal(variants.dimensions.listening.items.length, 2);
  assert.equal(variants.dimensions.transfer.percent, 100);
  assert.equal(
    buildPracticeEvidence(library, "all", now + 1000, "delayed").attemptCount,
    1,
  );
  assert.deepEqual(library.attempts[0], original.attempts[0]);
});
