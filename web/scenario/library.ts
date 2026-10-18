import { scenarioCourses, getScenario } from "./catalogue.ts";
import { scenarioId } from "./content.ts";
import { findVariant } from "./variants.ts";
import {
  parseRevisitMetadata,
  parseRevisitRun,
  revisitReady,
  type RevisitRun,
  type RevisitMetadata,
} from "./revisit.ts";
import {
  SCENARIO_STORAGE_KEY,
  newScenarioProgress,
  parseScenarioProgress,
  meaningPracticeAdvice,
  unlockedStage,
  type ScenarioProgress,
} from "./progress.ts";

export const LIBRARY_STORAGE_KEY = "jp-learn-scenarios-v2";
export type FocusSkill = "listening" | "speaking" | "reading";
export interface PracticeTarget {
  lessonId: string;
  skill: FocusSkill;
  promptId?: string;
}
export interface FocusRun extends PracticeTarget {
  progress: ScenarioProgress;
}
export interface SavedAttempt extends PracticeTarget {
  kind: "lesson" | "focus" | "revisit";
  revisit?: RevisitMetadata;
  completedAt: string;
  progress: ScenarioProgress;
}
export interface LearningLibrary {
  version: 2;
  selectedId: string;
  courses: Record<string, ScenarioProgress>;
  attempts: SavedAttempt[];
  focus: FocusRun | null;
  revisit: RevisitRun | null;
  exposures: { baseId: string; at: string }[];
}
export function newLibrary(): LearningLibrary {
  return {
    version: 2,
    selectedId: scenarioId,
    courses: Object.fromEntries(
      scenarioCourses.map((course) => [
        course.id,
        newScenarioProgress(0, course.id),
      ]),
    ),
    attempts: [],
    focus: null,
    revisit: null,
    exposures: [],
  };
}
export function hasStarted(progress: ScenarioProgress): boolean {
  return (
    progress.stage > 0 ||
    progress.heard ||
    Object.keys(progress.answers).length > 0 ||
    Object.keys(progress.speaking).length > 0 ||
    progress.supports.listening.length > 0
  );
}
export function libraryHasProgress(library: LearningLibrary): boolean {
  return (
    library.attempts.length > 0 ||
    library.focus !== null ||
    library.revisit !== null ||
    library.exposures.length > 0 ||
    scenarioCourses.some((course) => {
      const progress = library.courses[course.id];
      return !!progress && hasStarted(progress);
    })
  );
}
/**
 * 文件优先；只有本地存在尚未写入文件的修改，或文件为空而本地有进度时，
 * 才继续使用本地记录。其余情况以 user/scenarios.json 为准。
 */
export function pickSyncedLibrary(
  local: LearningLibrary,
  remote: LearningLibrary | null,
  localPending: boolean,
): LearningLibrary {
  if (!remote || localPending) return local;
  if (!libraryHasProgress(remote) && libraryHasProgress(local)) return local;
  return remote;
}
export function recommendedCourse(library: LearningLibrary): string {
  const selected = library.courses[library.selectedId];
  if (selected && hasStarted(selected) && !selected.completedAt)
    return selected.lessonId;
  return (
    scenarioCourses.find(
      (c) =>
        hasStarted(library.courses[c.id]) && !library.courses[c.id].completedAt,
    )?.id ??
    scenarioCourses.find((c) => library.courses[c.id].completedRuns === 0)
      ?.id ??
    library.selectedId
  );
}
export function updateCourse(
  library: LearningLibrary,
  lessonId: string,
  progress: ScenarioProgress,
): LearningLibrary {
  if (progress.lessonId !== lessonId || !library.courses[lessonId])
    return library;
  const completing =
    !library.courses[lessonId].completedAt && !!progress.completedAt;
  return {
    ...library,
    selectedId: lessonId,
    courses: { ...library.courses, [lessonId]: progress },
    attempts: completing
      ? [
          ...library.attempts,
          {
            kind: "lesson",
            lessonId,
            skill: "speaking",
            completedAt: progress.completedAt!,
            progress: structuredClone(progress),
          },
        ]
      : library.attempts,
  };
}
export function practiceRecommendation(
  progress: ScenarioProgress,
): PracticeTarget {
  const course = getScenario(progress.lessonId);
  const prompt = [...course.responsePrompts, course.transferPrompt].find(
    (p) => progress.speaking[p.id]?.rating !== "independent",
  );
  if (prompt)
    return { lessonId: course.id, skill: "speaking", promptId: prompt.id };
  if (meaningPracticeAdvice(progress, "listening"))
    return { lessonId: course.id, skill: "listening" };
  if (meaningPracticeAdvice(progress, "reading"))
    return { lessonId: course.id, skill: "reading" };
  return {
    lessonId: course.id,
    skill: "speaking",
    promptId: course.transferPrompt.id,
  };
}
export function targetTitle(target: PracticeTarget): string {
  const course = getScenario(target.lessonId);
  if (target.skill === "speaking")
    return (
      [...course.responsePrompts, course.transferPrompt].find(
        (p) => p.id === target.promptId,
      )?.title ?? "开口回应"
    );
  return target.skill === "listening" ? "再听懂一次对话" : "再读懂一条消息";
}
export function recommendedPractice(library: LearningLibrary): PracticeTarget {
  const fullIndex = library.attempts
    .map((attempt) => attempt.kind)
    .lastIndexOf("lesson");
  const base =
    fullIndex >= 0
      ? library.attempts[fullIndex].progress
      : library.courses[recommendedCourse(library)];
  const progress = structuredClone(base);
  const course = getScenario(progress.lessonId);
  // Recommendations use later focused attempts without rewriting the original course result.
  for (const attempt of library.attempts.slice(fullIndex + 1)) {
    if (attempt.kind !== "focus" || attempt.lessonId !== progress.lessonId)
      continue;
    if (attempt.skill === "speaking" && attempt.promptId) {
      progress.speaking[attempt.promptId] =
        attempt.progress.speaking[attempt.promptId];
    } else if (attempt.skill !== "speaking") {
      const questions =
        attempt.skill === "listening"
          ? course.listeningQuestions
          : course.readingQuestions;
      for (const question of questions)
        progress.answers[question.id] = attempt.progress.answers[question.id];
      progress.supports[attempt.skill] =
        attempt.progress.supports[attempt.skill];
      if (attempt.skill === "listening")
        progress.heard = attempt.progress.heard;
    }
  }
  return library.focus ?? practiceRecommendation(progress);
}
export function sameTarget(a: PracticeTarget, b: PracticeTarget): boolean {
  return (
    a.lessonId === b.lessonId &&
    a.skill === b.skill &&
    a.promptId === b.promptId
  );
}
export function startFocus(
  library: LearningLibrary,
  target: PracticeTarget,
): LearningLibrary {
  if (library.revisit) return library;
  if (library.focus && sameTarget(library.focus, target)) return library;
  // A pending focused attempt must be resumed or explicitly finished before starting another.
  if (library.focus) return library;
  return {
    ...library,
    focus: { ...target, progress: newScenarioProgress(0, target.lessonId) },
  };
}
export function focusReady(run: FocusRun): boolean {
  const course = getScenario(run.lessonId);
  if (run.skill === "speaking")
    return !!run.promptId && !!run.progress.speaking[run.promptId]?.rating;
  const questions =
    run.skill === "listening"
      ? course.listeningQuestions
      : course.readingQuestions;
  return questions.every((q) => !!run.progress.answers[q.id]);
}
export function finishFocus(library: LearningLibrary): LearningLibrary {
  const run = library.focus;
  if (!run || !focusReady(run)) return library;
  return {
    ...library,
    focus: null,
    attempts: [
      ...library.attempts,
      {
        ...run,
        kind: "focus",
        completedAt: new Date().toISOString(),
        progress: structuredClone(run.progress),
      },
    ],
  };
}
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function knownId(value: unknown): value is string {
  return (
    typeof value === "string" && scenarioCourses.some((c) => c.id === value)
  );
}
function parseTarget(value: Record<string, unknown>): PracticeTarget | null {
  if (
    !knownId(value.lessonId) ||
    !["listening", "speaking", "reading"].includes(String(value.skill))
  )
    return null;
  const skill = value.skill as FocusSkill;
  if (skill !== "speaking") return { lessonId: value.lessonId, skill };
  const course = getScenario(value.lessonId);
  if (
    typeof value.promptId !== "string" ||
    ![...course.responsePrompts, course.transferPrompt].some(
      (p) => p.id === value.promptId,
    )
  )
    return null;
  return { lessonId: value.lessonId, skill, promptId: value.promptId };
}
export function parseLibrary(
  raw: string | null,
  legacy: string | null,
): LearningLibrary {
  const fresh = newLibrary();
  try {
    const value: unknown = raw ? JSON.parse(raw) : null;
    if (record(value) && value.version === 2 && record(value.courses)) {
      if (knownId(value.selectedId)) fresh.selectedId = value.selectedId;
      for (const course of scenarioCourses)
        fresh.courses[course.id] = parseScenarioProgress(
          JSON.stringify(value.courses[course.id]),
          course.id,
        );
      if (Array.isArray(value.attempts)) {
        for (const item of value.attempts) {
          if (
            !record(item) ||
            !(
              knownId(item.lessonId) ||
              (typeof item.lessonId === "string" && findVariant(item.lessonId))
            ) ||
            !["lesson", "focus", "revisit"].includes(String(item.kind)) ||
            typeof item.completedAt !== "string" ||
            Number.isNaN(Date.parse(item.completedAt))
          )
            continue;
          const progress = parseScenarioProgress(
            JSON.stringify(item.progress),
            String(item.lessonId),
          );
          if (
            item.kind === "lesson" &&
            knownId(item.lessonId) &&
            unlockedStage(progress) === 5
          )
            fresh.attempts.push({
              kind: "lesson",
              lessonId: item.lessonId,
              skill: "speaking",
              completedAt: item.completedAt,
              progress,
            });
          if (item.kind === "focus") {
            const target = parseTarget(item);
            if (target && focusReady({ ...target, progress }))
              fresh.attempts.push({
                ...target,
                kind: "focus",
                completedAt: item.completedAt,
                progress,
              });
          }
          if (item.kind === "revisit") {
            const metadata = parseRevisitMetadata(item.revisit);
            if (
              metadata &&
              metadata.variantId === item.lessonId &&
              revisitReady(progress) &&
              Date.parse(item.completedAt) >= Date.parse(metadata.startedAt)
            )
              fresh.attempts.push({
                kind: "revisit",
                lessonId: metadata.variantId,
                skill: "speaking",
                completedAt: item.completedAt,
                progress,
                revisit: metadata,
              });
          }
        }
      }
      if (record(value.focus)) {
        const target = parseTarget(value.focus);
        if (target)
          fresh.focus = {
            ...target,
            progress: parseScenarioProgress(
              JSON.stringify(value.focus.progress),
              target.lessonId,
            ),
          };
      }
      if (!fresh.focus) fresh.revisit = parseRevisitRun(value.revisit);
      if (Array.isArray(value.exposures))
        fresh.exposures = value.exposures.flatMap((item) =>
          record(item) &&
          knownId(item.baseId) &&
          typeof item.at === "string" &&
          Number.isFinite(Date.parse(item.at))
            ? [{ baseId: item.baseId, at: item.at }]
            : [],
        );
      return fresh;
    }
  } catch {
    /* Keep the v1 record as a recovery source when v2 cannot be read. */
  }
  const pilot = parseScenarioProgress(legacy);
  fresh.courses[scenarioId] = pilot;
  if (pilot.completedAt)
    fresh.attempts.push({
      kind: "lesson",
      lessonId: scenarioId,
      skill: "speaking",
      completedAt: pilot.completedAt,
      progress: structuredClone(pilot),
    });
  return fresh;
}
export function loadLibrary(): LearningLibrary {
  try {
    return parseLibrary(
      localStorage.getItem(LIBRARY_STORAGE_KEY),
      localStorage.getItem(SCENARIO_STORAGE_KEY),
    );
  } catch {
    return newLibrary();
  }
}
