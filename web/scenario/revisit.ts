import { scenarioCourses, getScenario } from "./catalogue.ts";
import { findVariant, getVariant } from "./variants.ts";
import {
  meaningScore,
  newScenarioProgress,
  parseScenarioProgress,
  type ScenarioProgress,
} from "./progress.ts";
import type { LearningLibrary, SavedAttempt } from "./library.ts";

const DAY = 86400000;
export const revisitIntervals = [1, 3, 7, 14] as const;
export interface RevisitMetadata {
  baseId: string;
  variantId: string;
  contentVersion: 1;
  mode: "delayed" | "practice";
  startedAt: string;
  anchorAt: string;
  dueAt: string;
  intervalDays: number;
}
export interface RevisitRun extends RevisitMetadata {
  step: number;
  progress: ScenarioProgress;
}
export interface RevisitPlan {
  baseId: string;
  anchorAt: string;
  dueAt: string;
  intervalDays: number;
  due: boolean;
  delayedRuns: number;
  variantRuns: number;
}
export const revisitStages = [
  "听懂新对话",
  "接一句话",
  "改变条件",
  "读懂新消息",
];
export function revisitUnlockedStep(progress: ScenarioProgress): number {
  const course = getScenario(progress.lessonId);
  if (!course.listeningQuestions.every((q) => progress.answers[q.id])) return 0;
  if (!course.responsePrompts.every((p) => progress.speaking[p.id]?.rating))
    return 1;
  if (!progress.speaking[course.transferPrompt.id]?.rating) return 2;
  if (!course.readingQuestions.every((q) => progress.answers[q.id])) return 3;
  return 4;
}
export function revisitReady(progress: ScenarioProgress): boolean {
  return revisitUnlockedStep(progress) === 4;
}
export function revisitIndependent(progress: ScenarioProgress): boolean {
  const course = getScenario(progress.lessonId);
  return (
    revisitReady(progress) &&
    progress.heard &&
    (["listening", "reading"] as const).every((skill) => {
      const score = meaningScore(progress, skill);
      return score.independent === score.total;
    }) &&
    [...course.responsePrompts, course.transferPrompt].every(
      (p) => progress.speaking[p.id]?.rating === "independent",
    )
  );
}
function dueDate(anchor: string, interval: number): string {
  return new Date(Date.parse(anchor) + interval * DAY).toISOString();
}
function eligible(
  metadata: RevisitMetadata,
  plan: Pick<RevisitPlan, "anchorAt" | "dueAt" | "intervalDays">,
): boolean {
  return (
    metadata.mode === "delayed" &&
    metadata.anchorAt === plan.anchorAt &&
    metadata.dueAt === plan.dueAt &&
    metadata.intervalDays === plan.intervalDays &&
    Date.parse(metadata.startedAt) >= Date.parse(plan.dueAt)
  );
}

// Fixed practice intervals, not a memory estimate. Every completed exposure restarts the waiting period.
export function revisitPlans(
  library: LearningLibrary,
  now = Date.now(),
): RevisitPlan[] {
  const attempts = library.attempts
    .map((attempt, index) => ({ attempt, index }))
    .filter(
      ({ attempt }) =>
        Number.isFinite(Date.parse(attempt.completedAt)) &&
        Date.parse(attempt.completedAt) <= now,
    )
    .sort(
      (a, b) =>
        Date.parse(a.attempt.completedAt) - Date.parse(b.attempt.completedAt) ||
        a.index - b.index,
    );
  const plans: RevisitPlan[] = [];
  for (const course of scenarioCourses) {
    if (!getVariant(course.id)) continue;
    const first = attempts.find(
      ({ attempt }) =>
        attempt.kind === "lesson" && attempt.lessonId === course.id,
    );
    const completedAt =
      first?.attempt.completedAt ?? library.courses[course.id].completedAt;
    if (
      !completedAt ||
      !Number.isFinite(Date.parse(completedAt)) ||
      Date.parse(completedAt) > now
    )
      continue;
    let anchorAt = completedAt;
    let level = 0;
    let delayedRuns = 0;
    let variantRuns = 0;
    const events = [
      ...attempts
        .filter(
          ({ attempt }) =>
            attempt.lessonId === course.id ||
            attempt.revisit?.baseId === course.id,
        )
        .map(({ attempt, index }) => ({
          at: attempt.completedAt,
          attempt,
          index,
        })),
      ...library.exposures
        .filter(
          (item) => item.baseId === course.id && Date.parse(item.at) <= now,
        )
        .map((item) => ({ at: item.at, attempt: null, index: -1 })),
    ].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    for (const { attempt, index, at } of events) {
      if (!attempt) {
        if (Date.parse(at) >= Date.parse(anchorAt)) anchorAt = at;
        continue;
      }
      if (
        (first && index === first.index) ||
        Date.parse(attempt.completedAt) < Date.parse(completedAt)
      )
        continue;
      if (
        attempt.lessonId !== course.id &&
        attempt.revisit?.baseId !== course.id
      )
        continue;
      if (attempt.kind === "lesson") level = 0;
      if (attempt.kind === "revisit" && attempt.revisit) {
        variantRuns += 1;
        if (
          eligible(attempt.revisit, {
            anchorAt,
            dueAt: dueDate(anchorAt, revisitIntervals[level]),
            intervalDays: revisitIntervals[level],
          })
        ) {
          delayedRuns += 1;
          level = revisitIndependent(attempt.progress)
            ? Math.min(level + 1, revisitIntervals.length - 1)
            : 0;
        }
        if (!revisitIndependent(attempt.progress)) level = 0;
      }
      anchorAt = attempt.completedAt;
    }
    const dueAt = dueDate(anchorAt, revisitIntervals[level]);
    plans.push({
      baseId: course.id,
      anchorAt,
      dueAt,
      intervalDays: revisitIntervals[level],
      due: Date.parse(dueAt) <= now,
      delayedRuns,
      variantRuns,
    });
  }
  return plans.sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
}

export function noteExposure(
  library: LearningLibrary,
  lessonId: string,
  now = Date.now(),
): LearningLibrary {
  const baseId = findVariant(lessonId)?.baseId ?? lessonId;
  if (!revisitPlans(library, now).some((plan) => plan.baseId === baseId))
    return library;
  const at = new Date(now).toISOString();
  if (
    library.exposures.at(-1)?.baseId === baseId &&
    library.exposures.at(-1)?.at === at
  )
    return library;
  return {
    ...library,
    exposures: [...library.exposures, { baseId, at }],
    revisit:
      library.revisit?.baseId === baseId &&
      now >= Date.parse(library.revisit.startedAt)
        ? { ...library.revisit, mode: "practice" }
        : library.revisit,
  };
}

export function startRevisit(
  library: LearningLibrary,
  baseId: string,
  now = Date.now(),
): LearningLibrary {
  if (library.revisit || library.focus) return library;
  const plan = revisitPlans(library, now).find(
    (item) => item.baseId === baseId,
  );
  const variant = getVariant(baseId);
  if (!plan || !variant) return library;
  return {
    ...library,
    revisit: {
      baseId,
      variantId: variant.id,
      contentVersion: variant.contentVersion,
      mode: plan.due ? "delayed" : "practice",
      startedAt: new Date(now).toISOString(),
      anchorAt: plan.anchorAt,
      dueAt: plan.dueAt,
      intervalDays: plan.intervalDays,
      step: 0,
      progress: {
        ...newScenarioProgress(0, variant.id),
        expressionsDone: true,
      },
    },
  };
}
export function finishRevisit(
  library: LearningLibrary,
  now = Date.now(),
): LearningLibrary {
  const run = library.revisit;
  if (!run || !revisitReady(run.progress) || now < Date.parse(run.startedAt))
    return library;
  const plan = revisitPlans(library, now).find(
    (item) => item.baseId === run.baseId,
  );
  const { step: _step, progress, ...metadata } = run;
  const completedAt = new Date(now).toISOString();
  const saved: SavedAttempt = {
    kind: "revisit",
    lessonId: run.variantId,
    skill: "speaking",
    completedAt,
    revisit: {
      ...metadata,
      mode: plan && eligible(run, plan) ? "delayed" : "practice",
    },
    progress: structuredClone({ ...progress, stage: 5, completedAt }),
  };
  return { ...library, revisit: null, attempts: [...library.attempts, saved] };
}
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
export function parseRevisitMetadata(value: unknown): RevisitMetadata | null {
  if (!record(value) || typeof value.variantId !== "string") return null;
  const variant = findVariant(value.variantId);
  if (
    !variant ||
    value.baseId !== variant.baseId ||
    value.contentVersion !== variant.contentVersion ||
    (value.mode !== "delayed" && value.mode !== "practice") ||
    typeof value.intervalDays !== "number" ||
    !revisitIntervals.some((days) => days === value.intervalDays)
  )
    return null;
  for (const field of ["startedAt", "anchorAt", "dueAt"])
    if (
      typeof value[field] !== "string" ||
      !Number.isFinite(Date.parse(value[field]))
    )
      return null;
  const metadata = value as unknown as RevisitMetadata;
  if (
    Date.parse(metadata.startedAt) < Date.parse(metadata.anchorAt) ||
    metadata.dueAt !== dueDate(metadata.anchorAt, metadata.intervalDays) ||
    (metadata.mode === "delayed" &&
      Date.parse(metadata.startedAt) < Date.parse(metadata.dueAt))
  )
    return null;
  return {
    baseId: variant.baseId,
    variantId: variant.id,
    contentVersion: 1,
    mode: metadata.mode,
    startedAt: metadata.startedAt,
    anchorAt: metadata.anchorAt,
    dueAt: metadata.dueAt,
    intervalDays: metadata.intervalDays,
  };
}
export function parseRevisitRun(value: unknown): RevisitRun | null {
  const metadata = parseRevisitMetadata(value);
  if (
    !metadata ||
    !record(value) ||
    !record(value.progress) ||
    value.progress.lessonId !== metadata.variantId
  )
    return null;
  const progress = parseScenarioProgress(
    JSON.stringify(value.progress),
    metadata.variantId,
  );
  progress.expressionsDone = true;
  const step =
    typeof value.step === "number" && Number.isInteger(value.step)
      ? value.step
      : 0;
  return {
    ...metadata,
    progress,
    step: Math.max(0, Math.min(step, 3, revisitUnlockedStep(progress))),
  };
}
