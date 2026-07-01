import type { SrsEntry } from "./types.js";

// ============================================================
// SM-2 简化版调度引擎
//
// 基于 SuperMemo SM-2 算法，简化为二值评分：
//   correct = true  → 相当于质量分 3（正确但有迟疑）
//   correct = false → 相当于质量分 1（完全错误）
//
// 核心规则：
//   - 答对：间隔递增，难度系数微升
//   - 答错：间隔重置为 1 天，难度系数下降
// ============================================================

const MIN_EASE = 1.3;
const INITIAL_EASE = 2.5;

/** 获取今天的日期字符串 YYYY-MM-DD */
export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 日期加 N 天 */
export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 创建一个全新的 SRS 条目 */
export function createSrsEntry(
  itemId: string,
  itemType: "word" | "sentence"
): SrsEntry {
  return {
    itemId,
    itemType,
    repetitions: 0,
    easeFactor: INITIAL_EASE,
    interval: 0,
    nextReview: today(), // 立即可复习
    lastReview: "",
  };
}

/**
 * 根据答题对错更新 SRS 状态
 * 返回更新后的条目（不修改原对象）
 */
export function updateSrs(entry: SrsEntry, correct: boolean): SrsEntry {
  const now = today();

  if (correct) {
    // 正确：递增间隔
    let newInterval: number;
    if (entry.repetitions === 0) {
      newInterval = 1;
    } else if (entry.repetitions === 1) {
      newInterval = 6;
    } else {
      newInterval = Math.round(entry.interval * entry.easeFactor);
    }

    const newEase = Math.max(MIN_EASE, entry.easeFactor + 0.1);

    return {
      ...entry,
      repetitions: entry.repetitions + 1,
      easeFactor: newEase,
      interval: newInterval,
      nextReview: addDays(now, newInterval),
      lastReview: now,
    };
  } else {
    // 错误：重置间隔
    const newEase = Math.max(MIN_EASE, entry.easeFactor - 0.2);

    return {
      ...entry,
      repetitions: 0,
      easeFactor: newEase,
      interval: 0,
      nextReview: now, // 明天再复习
      lastReview: now,
    };
  }
}

/** 筛选出今天需要复习的条目 */
export function getDueEntries(entries: SrsEntry[]): SrsEntry[] {
  const todayStr = today();
  return entries.filter((e) => e.nextReview <= todayStr);
}

/** 统计：今天待复习数、总掌握数等 */
export function getStats(entries: SrsEntry[]): {
  total: number;
  due: number;
  mastered: number; // interval >= 21 天的视为已掌握
} {
  const due = getDueEntries(entries).length;
  const mastered = entries.filter((e) => e.interval >= 21).length;
  return { total: entries.length, due, mastered };
}
