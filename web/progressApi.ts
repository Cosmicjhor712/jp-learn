// ============================================================
// 进度读写：优先 /api/progress（与终端版共用 user/progress.json），
// 接口不可用时回退到浏览器 localStorage
// ============================================================

import type { Lesson, Progress, SrsEntry } from "../src/types.ts";
import { createSrsEntry } from "../src/srs.ts";

const LS_KEY = "jp-learn-progress";

function initProgress(lessons: Lesson[]): Progress {
  const entries: Record<string, SrsEntry> = {};
  for (const lesson of lessons) {
    for (const word of lesson.vocabulary) {
      entries[word.id] = createSrsEntry(word.id, "word");
    }
    for (const sentence of lesson.sentences) {
      entries[sentence.id] = createSrsEntry(sentence.id, "sentence");
    }
  }
  return { entries, completedLessons: [] };
}

function completeMissing(progress: Progress, lessons: Lesson[]): boolean {
  let changed = false;
  for (const lesson of lessons) {
    for (const word of lesson.vocabulary) {
      if (!progress.entries[word.id]) {
        progress.entries[word.id] = createSrsEntry(word.id, "word");
        changed = true;
      }
    }
    for (const sentence of lesson.sentences) {
      if (!progress.entries[sentence.id]) {
        progress.entries[sentence.id] = createSrsEntry(sentence.id, "sentence");
        changed = true;
      }
    }
  }
  if (!progress.completedLessons) progress.completedLessons = [];
  return changed;
}

function loadLocal(lessons: Lesson[]): Progress {
  const raw = localStorage.getItem(LS_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Progress;
      if (parsed && parsed.entries) {
        completeMissing(parsed, lessons);
        return parsed;
      }
    } catch {
      // 损坏则重新初始化
    }
  }
  const fresh = initProgress(lessons);
  localStorage.setItem(LS_KEY, JSON.stringify(fresh));
  return fresh;
}

export async function loadProgress(lessons: Lesson[]): Promise<Progress> {
  try {
    const res = await fetch("/api/progress");
    if (res.ok) {
      const data = (await res.json()) as Progress | null;
      if (data && data.entries) {
        completeMissing(data, lessons);
        return data;
      }
    }
  } catch {
    // 接口不可用，回退 localStorage
  }
  return loadLocal(lessons);
}

export function saveProgress(progress: Progress): void {
  localStorage.setItem(LS_KEY, JSON.stringify(progress));
  fetch("/api/progress", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(progress),
  }).catch(() => {
    // 离线时静默失败，数据仍在 localStorage
  });
}
