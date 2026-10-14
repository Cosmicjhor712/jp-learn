import { getScenario } from "./catalogue.ts";
import type { LearningLibrary, PracticeTarget } from "./library.ts";
import type { SelfRating, Support } from "./progress.ts";
import { findVariant } from "./variants.ts";

export const dimensions = [
  "listening",
  "response",
  "transfer",
  "reading",
] as const;
export type Dimension = (typeof dimensions)[number];
export type EvidencePeriod = "recent" | "all";
export type EvidenceSource = "course" | "variant" | "delayed";
export const dimensionLabels: Record<Dimension, string> = {
  listening: "听力理解",
  response: "开口回应",
  transfer: "迁移表达",
  reading: "阅读理解",
};
export interface EvidenceItem {
  id: string;
  title: string;
  target: PracticeTarget;
  attemptIndex: number;
  completedAt: string;
  independent: boolean;
  correct: boolean | null;
  rating: SelfRating | null;
  supports?: Support[];
}
export interface DimensionEvidence {
  id: Dimension;
  items: EvidenceItem[];
  independent: number;
  correct: number;
  assisted: number;
  again: number;
  percent: number | null;
  courseCount: number;
  attemptCount: number;
  lastPracticedAt: string | null;
  supportCounts: Partial<Record<Support, number>>;
  unknownSupports: number;
  target: PracticeTarget | null;
}
export interface PracticeEvidence {
  dimensions: Record<Dimension, DimensionEvidence>;
  attemptCount: number;
  courseCount: number;
  textOnlyCount: number;
}

function priority(item: EvidenceItem): number {
  if (item.correct === false || item.rating === "again") return 0;
  return item.independent ? 2 : 1;
}

// This is a view of saved attempts, never a new score written to learning progress.
export function buildPracticeEvidence(
  library: LearningLibrary,
  period: EvidencePeriod = "recent",
  now = Date.now(),
  source: EvidenceSource = "course",
): PracticeEvidence {
  const maps = Object.fromEntries(
    dimensions.map((id) => [id, new Map<string, EvidenceItem>()]),
  ) as Record<Dimension, Map<string, EvidenceItem>>;
  const counts: Record<Dimension, number> = {
    listening: 0,
    response: 0,
    transfer: 0,
    reading: 0,
  };
  const since =
    period === "recent" ? now - 30 * 24 * 60 * 60 * 1000 : -Infinity;
  const attempts = library.attempts
    .map((attempt, index) => ({
      attempt,
      index,
      time: Date.parse(attempt.completedAt),
    }))
    .filter(
      ({ attempt, time }) =>
        Number.isFinite(time) &&
        time >= since &&
        time <= now &&
        (source === "course"
          ? attempt.kind !== "revisit"
          : attempt.kind === "revisit" &&
            (source === "variant" || attempt.revisit?.mode === "delayed")),
    )
    .sort((a, b) => a.time - b.time || a.index - b.index);
  let textOnlyCount = 0;
  for (const { attempt, index } of attempts) {
    const course = getScenario(attempt.lessonId);
    const progress = attempt.progress;
    for (const dimension of dimensions) {
      const spoken = dimension === "response" || dimension === "transfer";
      const skill = spoken ? "speaking" : dimension;
      if (attempt.kind === "focus" && attempt.skill !== skill) continue;
      if (dimension === "listening" && !progress.heard) {
        textOnlyCount += 1;
        continue;
      }
      const items: EvidenceItem[] = [];
      if (spoken) {
        const prompts =
          dimension === "response"
            ? course.responsePrompts
            : [course.transferPrompt];
        for (const prompt of prompts) {
          if (attempt.kind === "focus" && attempt.promptId !== prompt.id)
            continue;
          const result = progress.speaking[prompt.id];
          if (!result?.rating) continue;
          items.push({
            id: prompt.id,
            title: prompt.title,
            target: {
              lessonId: course.id,
              skill: "speaking",
              promptId: prompt.id,
            },
            attemptIndex: index,
            completedAt: attempt.completedAt,
            independent: result.rating === "independent",
            correct: null,
            rating: result.rating,
          });
        }
      } else {
        const questions =
          dimension === "listening"
            ? course.listeningQuestions
            : course.readingQuestions;
        for (const question of questions) {
          const result = progress.answers[question.id];
          if (!result) continue;
          const correct = result.choice === question.correct;
          items.push({
            id: question.id,
            title: question.prompt,
            target: { lessonId: course.id, skill: dimension },
            attemptIndex: index,
            completedAt: attempt.completedAt,
            independent: correct && result.independent,
            correct,
            rating: null,
            supports: result.supports,
          });
        }
      }
      if (items.length > 0) counts[dimension] += 1;
      // Later focused practice replaces only its own items; repeated questions do not inflate coverage.
      for (const item of items)
        maps[dimension].set(`${course.id}/${item.id}`, item);
    }
  }
  const result = Object.fromEntries(
    dimensions.map((id) => {
      const items = [...maps[id].values()];
      const independent = items.filter((item) => item.independent).length;
      const supportCounts: Partial<Record<Support, number>> = {};
      let unknownSupports = 0;
      for (const item of items) {
        if (item.correct === null) continue;
        if (!item.supports) unknownSupports += 1;
        else
          for (const support of new Set(item.supports))
            supportCounts[support] = (supportCounts[support] ?? 0) + 1;
      }
      const ordered = [...items].sort(
        (a, b) =>
          priority(a) - priority(b) ||
          Date.parse(a.completedAt) - Date.parse(b.completedAt),
      );
      const latest = [...items].sort(
        (a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt),
      )[0];
      const value: DimensionEvidence = {
        id,
        items,
        independent,
        correct: items.filter((item) => item.correct === true).length,
        assisted: items.filter((item) => item.rating === "assisted").length,
        again: items.filter((item) => item.rating === "again").length,
        percent: items.length
          ? Math.round((independent / items.length) * 100)
          : null,
        courseCount: new Set(
          items.map(
            (item) =>
              findVariant(item.target.lessonId)?.baseId ?? item.target.lessonId,
          ),
        ).size,
        attemptCount: counts[id],
        lastPracticedAt: latest?.completedAt ?? null,
        supportCounts,
        unknownSupports,
        target: ordered[0]?.target ?? null,
      };
      return [id, value];
    }),
  ) as Record<Dimension, DimensionEvidence>;
  return {
    dimensions: result,
    attemptCount: attempts.length,
    courseCount: new Set(
      attempts.map(
        ({ attempt }) =>
          findVariant(attempt.lessonId)?.baseId ?? attempt.lessonId,
      ),
    ).size,
    textOnlyCount,
  };
}
