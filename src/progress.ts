import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Lesson, Progress, SrsEntry } from "./types.js";
import { createSrsEntry } from "./srs.js";

// ============================================================
// 进度持久化
// ============================================================

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROGRESS_FILE = path.resolve(__dirname, "..", "user", "progress.json");

/** 读取用户进度，如果文件不存在则返回 null */
export function loadProgress(): Progress | null {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      const raw = fs.readFileSync(PROGRESS_FILE, "utf-8");
      return JSON.parse(raw) as Progress;
    }
  } catch (e) {
    // 文件损坏，忽略
  }
  return null;
}

/** 保存用户进度 */
export function saveProgress(progress: Progress): void {
  const dir = path.dirname(PROGRESS_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2), "utf-8");
}

/** 从课程列表初始化一个新进度（first run） */
export function initProgress(lessons: Lesson[]): Progress {
  const entries: Record<string, SrsEntry> = {};

  for (const lesson of lessons) {
    for (const word of lesson.vocabulary) {
      entries[word.id] = createSrsEntry(word.id, "word");
    }
    for (const sentence of lesson.sentences) {
      entries[sentence.id] = createSrsEntry(sentence.id, "sentence");
    }
  }

  return {
    entries,
    completedLessons: [],
  };
}

/** 获取或初始化进度 */
export function getOrInitProgress(lessons: Lesson[]): Progress {
  const existing = loadProgress();
  if (existing) {
    // 如果课程数据更新了，补全新词条
    let changed = false;
    for (const lesson of lessons) {
      for (const word of lesson.vocabulary) {
        if (!existing.entries[word.id]) {
          existing.entries[word.id] = createSrsEntry(word.id, "word");
          changed = true;
        }
      }
      for (const sentence of lesson.sentences) {
        if (!existing.entries[sentence.id]) {
          existing.entries[sentence.id] = createSrsEntry(
            sentence.id,
            "sentence"
          );
          changed = true;
        }
      }
    }
    if (changed) saveProgress(existing);
    return existing;
  }

  const fresh = initProgress(lessons);
  saveProgress(fresh);
  return fresh;
}
