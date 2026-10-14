import test from "node:test";
import assert from "node:assert/strict";
import {
  listeningQuestions,
  readingQuestions,
  speakingPrompts,
} from "../web/scenario/content.ts";
import {
  addSupport,
  answerMeaning,
  meaningPracticeAdvice,
  meaningScore,
  newScenarioProgress,
  parseScenarioProgress,
  unlockedStage,
  visitStage,
} from "../web/scenario/progress.ts";

test("meaning results capture support at answer time and cannot be overwritten", () => {
  let progress = newScenarioProgress();
  progress.heard = true;
  progress = answerMeaning(
    progress,
    listeningQuestions[0].id,
    listeningQuestions[0].correct,
  );
  progress = addSupport(progress, "listening", "transcript");
  progress = addSupport(progress, "listening", "transcript");
  progress = answerMeaning(
    progress,
    listeningQuestions[1].id,
    listeningQuestions[1].correct,
  );
  assert.equal(progress.supports.listening.length, 1);
  assert.equal(progress.answers["listen-intent"].independent, true);
  assert.deepEqual(progress.answers["listen-intent"].supports, []);
  assert.equal(progress.answers["listen-time"].independent, false);
  assert.deepEqual(progress.answers["listen-time"].supports, ["transcript"]);
  assert.strictEqual(answerMeaning(progress, "listen-time", 0), progress);
  assert.strictEqual(answerMeaning(progress, "unknown", 0), progress);
  assert.strictEqual(answerMeaning(progress, "listen-place", 99), progress);
  assert.deepEqual(meaningScore(progress, "listening"), {
    total: 3,
    answered: 2,
    correct: 2,
    independent: 1,
  });
});

test("all-correct assisted work stays full credit with aid-specific practice advice", () => {
  for (const support of ["slow", "transcript", "translation"] as const) {
    let progress = addSupport(newScenarioProgress(), "listening", support);
    progress.heard = true;
    for (const q of listeningQuestions)
      progress = answerMeaning(progress, q.id, q.correct);
    assert.equal(meaningScore(progress, "listening").correct, 3);
    assert.equal(meaningScore(progress, "listening").independent, 0);
    const expected =
      support === "slow"
        ? "正常语速"
        : support === "transcript"
          ? "先不看日文原文"
          : "先不看中文释义";
    assert.ok(meaningPracticeAdvice(progress, "listening")?.includes(expected));
  }
  for (const support of ["reading", "romaji", "translation"] as const) {
    let progress = addSupport(newScenarioProgress(), "reading", support);
    for (const q of readingQuestions)
      progress = answerMeaning(progress, q.id, q.correct);
    assert.equal(meaningScore(progress, "reading").correct, 2);
    const expected =
      support === "reading"
        ? "「駅」、「予約」"
        : support === "romaji"
          ? "先不看罗马音"
          : "先不看中文释义";
    assert.ok(meaningPracticeAdvice(progress, "reading")?.includes(expected));
  }
});

test("advice targets actual mistakes and ignores aids opened after answering", () => {
  let progress = newScenarioProgress();
  assert.equal(meaningPracticeAdvice(progress, "reading"), null);
  progress.heard = true;
  for (const q of listeningQuestions)
    progress = answerMeaning(progress, q.id, q.correct);
  progress = addSupport(progress, "listening", "translation");
  assert.equal(meaningPracticeAdvice(progress, "listening"), null);
  progress = answerMeaning(progress, "read-time", 0);
  progress = answerMeaning(progress, "read-route", 2);
  assert.ok(
    meaningPracticeAdvice(progress, "reading")?.includes(
      readingQuestions[0].prompt,
    ),
  );
  assert.ok(
    !meaningPracticeAdvice(progress, "reading")?.includes(
      readingQuestions[1].prompt,
    ),
  );
});

test("legacy assisted results retain correct totals without invented question-level details", () => {
  const legacy = newScenarioProgress();
  legacy.heard = true;
  legacy.supports.listening = ["slow"];
  legacy.supports.reading = ["reading"];
  for (const q of [...listeningQuestions, ...readingQuestions])
    legacy.answers[q.id] = { choice: q.correct, independent: false };
  const restored = parseScenarioProgress(JSON.stringify(legacy));
  assert.deepEqual(restored.answers, legacy.answers);
  assert.equal(meaningScore(restored, "listening").correct, 3);
  assert.equal(meaningScore(restored, "reading").correct, 2);
  assert.ok(meaningPracticeAdvice(restored, "listening")?.includes("正常语速"));
  assert.ok(meaningPracticeAdvice(restored, "reading")?.includes("假名注音"));
});

test("question support snapshots survive reload and sanitize unsupported values", () => {
  let progress = addSupport(newScenarioProgress(), "reading", "reading");
  progress = answerMeaning(progress, "read-time", 1);
  progress = addSupport(progress, "reading", "translation");
  const restored = parseScenarioProgress(JSON.stringify(progress));
  assert.deepEqual(restored.answers["read-time"].supports, ["reading"]);
  const malformed = JSON.stringify({
    ...restored,
    answers: {
      "read-time": {
        choice: 1,
        independent: true,
        supports: ["translation", "not-a-support", "translation"],
      },
    },
  });
  assert.deepEqual(parseScenarioProgress(malformed).answers["read-time"], {
    choice: 1,
    independent: false,
    supports: ["translation"],
  });
});

test("unplayed audio and reading aids cannot earn independent comprehension credit", () => {
  let progress = answerMeaning(newScenarioProgress(), "listen-intent", 0);
  assert.equal(progress.answers["listen-intent"].independent, false);
  progress = addSupport(progress, "reading", "reading");
  progress = answerMeaning(progress, "read-time", 1);
  assert.equal(progress.answers["read-time"].independent, false);
  assert.equal(meaningScore(progress, "reading").correct, 1);
});

test("phases unlock by participation and finishing counts only once", () => {
  let progress = newScenarioProgress();
  assert.strictEqual(visitStage(progress, 5), progress);
  for (const q of listeningQuestions)
    progress = answerMeaning(progress, q.id, 0);
  assert.equal(unlockedStage(progress), 1);
  progress.expressionsDone = true;
  assert.equal(unlockedStage(progress), 2);
  for (const prompt of speakingPrompts)
    progress.speaking[prompt.id] = {
      revealed: true,
      triedFirst: false,
      rating: "again",
    };
  assert.equal(unlockedStage(progress), 4);
  for (const q of readingQuestions)
    progress = answerMeaning(progress, q.id, q.correct);
  progress = visitStage(progress, 5);
  assert.equal(progress.completedRuns, 1);
  assert.ok(progress.completedAt);
  assert.equal(visitStage(visitStage(progress, 4), 5).completedRuns, 1);
  assert.deepEqual(parseScenarioProgress(JSON.stringify(progress)), progress);
  assert.equal(newScenarioProgress(progress.completedRuns).completedRuns, 1);
});

test("corrupted or outdated local progress is sanitized without unlocking future phases", () => {
  for (const raw of [null, "{bad", "null", "[]", '{"version":42}'])
    assert.deepEqual(parseScenarioProgress(raw), newScenarioProgress());
  const result = parseScenarioProgress(
    JSON.stringify({
      ...newScenarioProgress(),
      stage: 99,
      heard: "yes",
      completedAt: "2026-10-13",
      completedRuns: -1,
      supports: { reading: ["reading", "surprise", "reading"] },
      answers: {
        "read-time": { choice: -1, independent: true },
        unknown: { choice: 0 },
      },
      speaking: {
        "respond-accept": {
          revealed: true,
          triedFirst: false,
          rating: "independent",
        },
      },
    }),
  );
  assert.equal(result.stage, 0);
  assert.equal(result.completedAt, null);
  assert.equal(result.completedRuns, 0);
  assert.deepEqual(result.answers, {});
  assert.deepEqual(result.supports.reading, ["reading"]);
  assert.equal(result.speaking["respond-accept"].rating, null);
});
