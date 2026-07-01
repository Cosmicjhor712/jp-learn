import type { SrsEntry } from "./types.js";

// ============================================================
// FSRS (Free Spaced Repetition Scheduler) 调度引擎
//
// 基于 FSRS-5 算法，使用四个核心参数：
//   S (Stability) — 记忆稳定度（天），值越大越牢固
//   D (Difficulty) — 难度 (1~10)
//   R (Retrievability) — 回忆概率 (0~1)
//   t (Elapsed) — 距离上次复习的天数
//
// R(t) = 2^(-t / S)
// ============================================================

// ---- 常数 ----

const INITIAL_STABILITY = 0.3;     // 首次学习的初始稳定度（天）
const INITIAL_DIFFICULTY = 5.0;    // 初始难度（中间值）
const MIN_DIFFICULTY = 1.0;
const MAX_DIFFICULTY = 10.0;

const MASTERED_THRESHOLD = 21;     // 稳定度 ≥ 21 天视为已掌握
const TARGET_RETENTION = 0.9;      // 目标回忆概率（下次复习时）

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

/** 计算经过的天数（从 dateStr 到今天） */
function elapsedDays(dateStr: string): number {
  const then = new Date(dateStr);
  const now = new Date();
  return Math.max(0, Math.floor((now.getTime() - then.getTime()) / 86400000));
}

// ---- 核心 FSRS 公式 ----

/**
 * 计算当前回忆概率 R
 * R(t) = 2^(-t / S)
 */
function retrievability(stability: number, elapsed: number): number {
  if (stability <= 0) return 0;
  return Math.pow(2, -elapsed / stability);
}

/**
 * 从评分 g 计算难度增量 delta
 * 评分含义：1=完全忘了 / 2=有点难 / 3=刚好（正确）/ 4=轻松
 */
function deltaDifficulty(grade: number): number {
  switch (grade) {
    case 1: return  0.3;  // 忘了 → 变难
    case 2: return  0.0;  // 难 → 不变
    case 3: return -0.5;  // 正常 → 变易
    case 4: return -0.8;  // 轻松 → 大减
    default: return  0.0;
  }
}

/**
 * 从评分 g 计算稳定度乘数 f
 * 答对（g≥3）时放大稳定性，答错（g≤2）时缩小
 */
function stabilityMultiplier(grade: number, difficulty: number): number {
  switch (grade) {
    case 1: return 0.4 / Math.pow(difficulty, 0.3);  // 忘了，大幅降低
    case 2: return 0.6;                               // 难，小幅降低
    case 3: return 1.3;                               // 正常，小幅增长
    case 4: return 1.5 + 0.15 * (10 - difficulty);    // 轻松，大幅增长（越容易增长越多）
    default: return 1.0;
  }
}

/**
 * 首次复习后的初始稳定性
 * 第一个正确回答就建立了初始稳定度
 */
function initialStability(grade: number): number {
  if (grade === 1) return INITIAL_STABILITY;          // 首次就忘了 → 基础值
  if (grade === 2) return INITIAL_STABILITY * 1.5;    // 有点难 → 稍高
  if (grade === 3) return INITIAL_STABILITY * 4;      // 正常 → 较高
  return INITIAL_STABILITY * 8;                       // 轻松 → 很高
}

// ---- 对外接口 ----

const DEFAULT_DIR = ".";
const DEFAULT_FILENAME = "data";

/** 创建全新的 SRS 条目 */
export function createSrsEntry(
  itemId: string,
  itemType: "word" | "sentence"
): SrsEntry {
  return {
    itemId,
    itemType,
    stability: INITIAL_STABILITY,
    difficulty: INITIAL_DIFFICULTY,
    retrievability: 0,
    interval: 0,
    nextReview: today(),  // 立即可复习
    lastReview: "",
    repetitions: 0,
  };
}

/**
 * 根据用户评分更新 SRS 状态（FSRS 核心）
 *
 * @param entry 当前条目
 * @param grade 用户评分：1=忘了 2=难 3=好 4=轻松
 * @returns 更新后的条目
 */
export function updateSrs(entry: SrsEntry, grade: number): SrsEntry {
  const now = today();
  const elapsed = entry.lastReview ? elapsedDays(entry.lastReview) : 0;
  const currentR = entry.lastReview
    ? retrievability(entry.stability, elapsed)
    : 1.0;

  // 更新难度
  const newDifficulty = Math.max(
    MIN_DIFFICULTY,
    Math.min(MAX_DIFFICULTY, entry.difficulty + deltaDifficulty(grade))
  );

  // 更新稳定度
  let newStability: number;
  if (entry.repetitions === 0) {
    // 第一次复习
    newStability = initialStability(grade);
  } else if (grade <= 2) {
    // 答错：稳定性乘以一个小于 1 的系数
    const mult = stabilityMultiplier(grade, newDifficulty);
    newStability = Math.max(INITIAL_STABILITY, entry.stability * mult);
  } else {
    // 答对：稳定性增长
    const mult = stabilityMultiplier(grade, newDifficulty);
    newStability = entry.stability * mult;
  }

  // 计算新间隔（目标是 TARGET_RETENTION 时复习）
  // 从 R = 2^(-t/S) 反推：t = -S * log2(R)
  // 当 R = TARGET_RETENTION 时，t = -S * log2(TARGET_RETENTION)
  const log2Target = Math.log2(TARGET_RETENTION); // 负数
  const newInterval = Math.max(1, Math.round(-newStability * log2Target));

  // 计算当前回忆概率
  const newR = retrievability(newStability, 0); // 刚复习完，R≈1.0

  return {
    ...entry,
    stability: newStability,
    difficulty: newDifficulty,
    retrievability: newR,
    interval: newInterval,
    nextReview: addDays(now, newInterval),
    lastReview: now,
    repetitions: entry.repetitions + 1,
  };
}

/** 获取当前回忆概率（不更新条目） */
export function getRetrievability(entry: SrsEntry): number {
  if (!entry.lastReview) return 0;
  const elapsed = elapsedDays(entry.lastReview);
  return retrievability(entry.stability, elapsed);
}

/** 筛选出今天需要复习的条目（R < TARGET_RETENTION） */
export function getDueEntries(entries: SrsEntry[]): SrsEntry[] {
  const todayStr = today();
  return entries.filter((e) => {
    // 还未开始 / 从未复习过的，也需要学
    if (!e.lastReview) return e.nextReview <= todayStr;
    // 已有复习记录的，用 R 值判断
    return getRetrievability(e) < TARGET_RETENTION;
  });
}

/** 统计信息 */
export function getStats(entries: SrsEntry[]): {
  total: number;
  due: number;
  mastered: number;
} {
  const due = getDueEntries(entries).length;
  const mastered = entries.filter((e) => e.stability >= MASTERED_THRESHOLD).length;
  return { total: entries.length, due, mastered };
}
