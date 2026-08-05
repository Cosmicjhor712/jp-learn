// ============================================================
// 终端版 / Web 版共享的业务逻辑
// ============================================================

import type { Lesson, SrsEntry } from "./types.js";

export interface ReviewPrompt {
  title: string;
  prompt: string;
  expected: string;
  alternatives?: string[];
  hint?: string;
}

export interface ListenItem {
  kind: "word" | "sentence";
  id: string;
  japanese: string;
  english: string;
  hint?: string;
  alternatives?: string[];
}

export function findLesson(
  lessons: Lesson[],
  lessonId: string
): Lesson | undefined {
  return lessons.find((lesson) => lesson.id === lessonId);
}

/** 复习题目提示（英文/中文 → 日文） */
export function findReviewPrompt(
  entry: SrsEntry,
  lessons: Lesson[]
): ReviewPrompt | null {
  for (const lesson of lessons) {
    if (entry.itemType === "word") {
      const word = lesson.vocabulary.find((item) => item.id === entry.itemId);
      if (!word) continue;

      return {
        title: "词汇回想",
        prompt: word.english,
        expected: word.japanese,
        hint: `词性：${word.partOfSpeech}`,
      };
    }

    const sentence = lesson.sentences.find((item) => item.id === entry.itemId);
    if (!sentence) continue;

    return {
      title: "整句翻译",
      prompt: sentence.english,
      expected: sentence.japanese,
      alternatives: sentence.alternatives,
      hint: sentence.grammarNote,
    };
  }

  return null;
}

/** 听力题目条目（播放文本 + 答案） */
export function findListenItem(
  itemId: string,
  lessons: Lesson[]
): ListenItem | null {
  for (const lesson of lessons) {
    const word = lesson.vocabulary.find((item) => item.id === itemId);
    if (word) {
      return {
        kind: "word",
        id: word.id,
        japanese: word.japanese,
        english: word.english,
        hint: `词性：${word.partOfSpeech}`,
      };
    }

    const sentence = lesson.sentences.find((item) => item.id === itemId);
    if (sentence) {
      return {
        kind: "sentence",
        id: sentence.id,
        japanese: sentence.japanese,
        english: sentence.english,
        hint: sentence.grammarNote,
        alternatives: sentence.alternatives,
      };
    }
  }

  return null;
}

export function buildListenQueue(lesson: Lesson): string[] {
  return [
    ...lesson.vocabulary.map((word) => word.id),
    ...lesson.sentences.map((sentence) => sentence.id),
  ];
}

export function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** 听力理解的 4 个选项（正确答案 + 3 个干扰项，随机排列） */
export function makeChoices(
  item: ListenItem,
  lessonId: string,
  lessons: Lesson[]
): { choices: string[]; correctIndex: number } {
  const pool: string[] = [];
  const pushLesson = (lesson: Lesson): void => {
    if (item.kind === "word") {
      pool.push(...lesson.vocabulary.map((word) => word.english));
    } else {
      pool.push(...lesson.sentences.map((sentence) => sentence.english));
    }
  };

  const lesson = findLesson(lessons, lessonId);
  if (lesson) pushLesson(lesson);
  if (pool.length < 4) {
    for (const other of lessons) {
      if (other.id !== lessonId) pushLesson(other);
    }
  }

  const distractors = shuffle([
    ...new Set(pool.filter((english) => english !== item.english)),
  ]).slice(0, 3);
  const choices = shuffle([item.english, ...distractors]);
  return { choices, correctIndex: choices.indexOf(item.english) };
}

/** 只保留已学课程对应的词条 */
export function entriesForCompletedLessons(
  entries: SrsEntry[],
  completedLessons: string[]
): SrsEntry[] {
  return entries.filter((entry) => {
    const m = entry.itemId.match(/^(lesson-\d+)_/);
    return m && completedLessons.includes(m[1]);
  });
}
