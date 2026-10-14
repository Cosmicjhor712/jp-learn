import { scenarioId } from "./content.ts";
import { getScenario } from "./catalogue.ts";

export const SCENARIO_STORAGE_KEY = "jp-learn-scenario-v1";
export type Support =
  "transcript" | "translation" | "slow" | "reading" | "romaji";
export const supportLabels: Record<Support, string> = {
  slow: "慢速听",
  transcript: "日文原文",
  reading: "假名注音",
  romaji: "罗马音",
  translation: "中文释义",
};
export type MeaningSkill = "listening" | "reading";
export type SelfRating = "independent" | "assisted" | "again";
export interface MeaningResult {
  choice: number;
  independent: boolean;
  // Absent in older records, which only tracked support for the whole section.
  supports?: Support[];
}
export interface SpeakingResult {
  triedFirst: boolean;
  revealed: boolean;
  rating: SelfRating | null;
}
export interface ScenarioProgress {
  version: 1;
  lessonId: string;
  stage: number;
  heard: boolean;
  supports: { listening: Support[]; reading: Support[] };
  answers: Record<string, MeaningResult>;
  expressionsDone: boolean;
  speaking: Record<string, SpeakingResult>;
  completedAt: string | null;
  completedRuns: number;
}
export function newScenarioProgress(
  completedRuns = 0,
  lessonId = scenarioId,
): ScenarioProgress {
  return {
    version: 1,
    lessonId,
    stage: 0,
    heard: false,
    supports: { listening: [], reading: [] },
    answers: {},
    expressionsDone: false,
    speaking: {},
    completedAt: null,
    completedRuns,
  };
}
export function unlockedStage(progress: ScenarioProgress): number {
  const {
    listeningQuestions,
    responsePrompts,
    transferPrompt,
    readingQuestions,
  } = getScenario(progress.lessonId);
  if (!listeningQuestions.every((q) => progress.answers[q.id])) return 0;
  if (!progress.expressionsDone) return 1;
  if (!responsePrompts.every((p) => progress.speaking[p.id]?.rating)) return 2;
  if (!progress.speaking[transferPrompt.id]?.rating) return 3;
  if (!readingQuestions.every((q) => progress.answers[q.id])) return 4;
  return 5;
}
export function visitStage(
  progress: ScenarioProgress,
  stage: number,
): ScenarioProgress {
  if (!Number.isInteger(stage) || stage < 0 || stage > unlockedStage(progress))
    return progress;
  const finishing = stage === 5 && !progress.completedAt;
  return {
    ...progress,
    stage,
    completedAt: finishing ? new Date().toISOString() : progress.completedAt,
    completedRuns: progress.completedRuns + (finishing ? 1 : 0),
  };
}
export function addSupport(
  progress: ScenarioProgress,
  skill: "listening" | "reading",
  support: Support,
): ScenarioProgress {
  if (progress.supports[skill].includes(support)) return progress;
  return {
    ...progress,
    supports: {
      ...progress.supports,
      [skill]: [...progress.supports[skill], support],
    },
  };
}
export function answerMeaning(
  progress: ScenarioProgress,
  id: string,
  choice: number,
): ScenarioProgress {
  const { listeningQuestions, readingQuestions } = getScenario(
    progress.lessonId,
  );
  const listening = listeningQuestions.some((q) => q.id === id);
  const question = [...listeningQuestions, ...readingQuestions].find(
    (q) => q.id === id,
  );
  if (
    !question ||
    progress.answers[id] ||
    !Number.isInteger(choice) ||
    choice < 0 ||
    choice >= question.options.length
  )
    return progress;
  const supports = [...progress.supports[listening ? "listening" : "reading"]];
  const independent = supports.length === 0 && (!listening || progress.heard);
  return {
    ...progress,
    answers: { ...progress.answers, [id]: { choice, independent, supports } },
  };
}
export function meaningScore(progress: ScenarioProgress, skill: MeaningSkill) {
  const { listeningQuestions, readingQuestions } = getScenario(
    progress.lessonId,
  );
  const questions =
    skill === "listening" ? listeningQuestions : readingQuestions;
  const correct = questions.filter(
    (q) => progress.answers[q.id]?.choice === q.correct,
  );
  return {
    total: questions.length,
    answered: questions.filter((q) => progress.answers[q.id]).length,
    correct: correct.length,
    independent: correct.filter((q) => progress.answers[q.id].independent)
      .length,
  };
}

export function meaningPracticeAdvice(
  progress: ScenarioProgress,
  skill: MeaningSkill,
): string | null {
  const {
    listeningQuestions,
    readingQuestions,
    listeningFocus,
    readingFocus,
    readingWords,
  } = getScenario(progress.lessonId);
  const questions =
    skill === "listening" ? listeningQuestions : readingQuestions;
  const score = meaningScore(progress, skill);
  if (score.answered !== score.total) return null;
  const title = skill === "listening" ? "听力" : "阅读";
  const incorrect = questions.filter(
    (q) => progress.answers[q.id].choice !== q.correct,
  );
  if (incorrect.length > 0) {
    const retry = skill === "listening" ? "再听一遍对话" : "再读一遍消息";
    return `${title}：${retry}，重点回答${incorrect.map((q) => `“${q.prompt}”`).join("、")}`;
  }
  if (skill === "listening" && !progress.heard) {
    return `听力：这轮文字理解题已全部答对。下次先播放对话，再试着听出${listeningFocus}。`;
  }
  if (score.independent === score.correct) return null;
  // Older records can support a section-level suggestion, not a per-question attribution.
  const used = new Set(
    questions.flatMap((q) => {
      const result = progress.answers[q.id];
      return (
        result.supports ?? (result.independent ? [] : progress.supports[skill])
      );
    }),
  );
  if (used.has("translation")) {
    return skill === "listening"
      ? "听力题已全部答对。下一轮先不看中文释义，再听一遍；需要时仍可用慢速或日文原文。"
      : `阅读题已全部答对。下一轮先不看中文释义，再找出${readingFocus}；需要时仍可保留注音。`;
  }
  if (skill === "listening") {
    if (used.has("transcript"))
      return `听力题已全部答对。下一轮先不看日文原文，试着听出${listeningFocus}；需要时仍可用慢速。`;
    if (used.has("slow"))
      return `听力题已全部答对。下一轮试一次正常语速，看看能否仍然听出${listeningFocus}。`;
  } else {
    if (used.has("romaji"))
      return "阅读题已全部答对。下一轮先不看罗马音，保留假名注音，再读一次消息。";
    if (used.has("reading"))
      return `阅读题已全部答对。下一轮试着认出${readingWords.map((word) => `「${word}」`).join("、")}，不确定时再查看假名注音。`;
  }
  return `${title}题已全部答对。下一轮尝试少用一种辅助，不确定时再查看。`;
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
// Local storage can come from an older build or a partial write; never trust its shape.
export function parseScenarioProgress(
  raw: string | null,
  lessonId = scenarioId,
): ScenarioProgress {
  const fresh = newScenarioProgress(0, lessonId);
  if (!raw) return fresh;
  try {
    const value: unknown = JSON.parse(raw);
    if (!object(value) || value.version !== 1 || value.lessonId !== lessonId)
      return fresh;
    const {
      listeningQuestions,
      readingQuestions,
      responsePrompts,
      transferPrompt,
    } = getScenario(lessonId);
    const speakingPrompts = [...responsePrompts, transferPrompt];
    const supports = Object.keys(supportLabels) as Support[];
    if (object(value.supports)) {
      for (const skill of ["listening", "reading"] as const) {
        const items = value.supports[skill];
        if (Array.isArray(items))
          fresh.supports[skill] = supports.filter((s) => items.includes(s));
      }
    }
    fresh.heard = value.heard === true;
    fresh.expressionsDone = value.expressionsDone === true;
    if (object(value.answers)) {
      for (const q of [...listeningQuestions, ...readingQuestions]) {
        const answer = value.answers[q.id];
        if (
          object(answer) &&
          typeof answer.choice === "number" &&
          Number.isInteger(answer.choice) &&
          answer.choice >= 0 &&
          answer.choice < q.options.length &&
          typeof answer.independent === "boolean"
        ) {
          fresh.answers[q.id] = {
            choice: answer.choice,
            independent:
              answer.independent &&
              (!listeningQuestions.some((question) => question.id === q.id) ||
                fresh.heard),
          };
          if (Array.isArray(answer.supports)) {
            const items = answer.supports;
            const snapshot = supports.filter((support) =>
              items.includes(support),
            );
            fresh.answers[q.id].supports = snapshot;
            if (snapshot.length > 0) fresh.answers[q.id].independent = false;
          }
        }
      }
    }
    if (object(value.speaking)) {
      for (const prompt of speakingPrompts) {
        const result = value.speaking[prompt.id];
        if (!object(result)) continue;
        const triedFirst = result.triedFirst === true;
        const revealed = result.revealed === true;
        const rating =
          result.rating === "assisted" ||
          result.rating === "again" ||
          (result.rating === "independent" && triedFirst)
            ? result.rating
            : null;
        fresh.speaking[prompt.id] = {
          triedFirst,
          revealed,
          rating: revealed ? rating : null,
        };
      }
    }
    if (
      typeof value.completedRuns === "number" &&
      Number.isSafeInteger(value.completedRuns) &&
      value.completedRuns >= 0
    )
      fresh.completedRuns = value.completedRuns;
    if (typeof value.stage === "number" && Number.isInteger(value.stage))
      fresh.stage = Math.max(0, Math.min(value.stage, unlockedStage(fresh)));
    if (
      unlockedStage(fresh) === 5 &&
      typeof value.completedAt === "string" &&
      !Number.isNaN(Date.parse(value.completedAt))
    )
      fresh.completedAt = value.completedAt;
    return fresh;
  } catch {
    return fresh;
  }
}
export function loadScenarioProgress(): ScenarioProgress {
  try {
    return parseScenarioProgress(localStorage.getItem(SCENARIO_STORAGE_KEY));
  } catch {
    return newScenarioProgress();
  }
}
