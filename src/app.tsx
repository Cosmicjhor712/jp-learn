import React, { useMemo, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { createRequire } from "node:module";
import type { Lesson, Progress, SrsEntry } from "./types.js";
import { getOrInitProgress, saveProgress } from "./progress.js";
import { getDueEntries, getStats, updateSrs } from "./srs.js";
import { checkAnswer } from "./exercises.js";
import SelectList from "./components/SelectList.js";
import ProgressBar from "./components/ProgressBar.js";
import QuestionBox from "./components/QuestionBox.js";

const require = createRequire(import.meta.url);
const lessons = require("../data/lessons.json") as Lesson[];

const APP_WIDTH = 72;

type Screen =
  | { type: "menu" }
  | { type: "lesson-select" }
  | { type: "grammar"; lessonId: string }
  | { type: "vocab-preview"; lessonId: string }
  | {
      type: "drill-word";
      lessonId: string;
      index: number;
      correctCount: number;
    }
  | {
      type: "drill-sentence";
      lessonId: string;
      index: number;
      wordCorrect: number;
      correctCount: number;
    }
  | {
      type: "lesson-complete";
      lessonId: string;
      wordCorrect: number;
      sentenceCorrect: number;
    }
  | { type: "review"; queue: string[]; index: number; correctCount: number }
  | { type: "review-done"; correctCount: number; total: number }
  | { type: "stats" };

interface ReviewPrompt {
  title: string;
  prompt: string;
  expected: string;
  alternatives?: string[];
  hint?: string;
}

function getLesson(lessonId: string): Lesson | undefined {
  return lessons.find((lesson) => lesson.id === lessonId);
}

function getReviewPrompt(entry: SrsEntry): ReviewPrompt | null {
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

function Panel({
  title,
  children,
  borderColor = "gray",
}: {
  title?: string;
  children: React.ReactNode;
  borderColor?: string;
}): React.JSX.Element {
  return (
    <Box
      width={APP_WIDTH}
      borderStyle="round"
      borderColor={borderColor}
      flexDirection="column"
      paddingX={1}
      paddingY={1}
      marginBottom={1}
    >
      {title ? (
        <Box marginBottom={1}>
          <Text bold color="cyan">
            {title}
          </Text>
        </Box>
      ) : null}
      {children}
    </Box>
  );
}

function entriesFromCompletedLessons(
  entries: SrsEntry[],
  completedLessons: string[]
): SrsEntry[] {
  return entries.filter((entry) => {
    const m = entry.itemId.match(/^(lesson-\d+)_/);
    return m && completedLessons.includes(m[1]);
  });
}

function TopBar({ progress }: { progress: Progress }): React.JSX.Element {
  const trained = progress.completedLessons.length > 0;
  const relevantEntries = trained
    ? entriesFromCompletedLessons(Object.values(progress.entries), progress.completedLessons)
    : Object.values(progress.entries);
  const stats = getStats(relevantEntries);

  return (
    <Box
      width={APP_WIDTH}
      borderStyle="round"
      borderColor="gray"
      paddingX={1}
      marginBottom={1}
      justifyContent="space-between"
    >
      <Text bold color="cyan">
        日本語学習
      </Text>
      <Text dimColor>
        {stats.due} 待复习 · {stats.mastered}/{stats.total} 掌握
      </Text>
    </Box>
  );
}

function KeyHint({ children }: { children?: React.ReactNode }): React.JSX.Element {
  return (
    <Text dimColor>
      {children ?? "↑/↓ 选择 · Enter 确认 · Esc 返回"}
    </Text>
  );
}

export default function App(): React.JSX.Element {
  const { exit } = useApp();
  const [progress, setProgress] = useState<Progress>(() =>
    getOrInitProgress(lessons)
  );
  const [screen, setScreen] = useState<Screen>({ type: "menu" });

  const stats = useMemo(() => {
    const trained = progress.completedLessons.length > 0;
    const relevant = trained
      ? entriesFromCompletedLessons(Object.values(progress.entries), progress.completedLessons)
      : Object.values(progress.entries);
    return getStats(relevant);
  }, [progress]);

  const staticInputActive =
    screen.type === "grammar" ||
    screen.type === "vocab-preview" ||
    screen.type === "lesson-complete" ||
    screen.type === "review-done" ||
    screen.type === "stats";

  useInput(
    (_input, key) => {
      if (key.escape) {
        setScreen({ type: "menu" });
        return;
      }

      if (!key.return) return;

      if (screen.type === "grammar") {
        setScreen({ type: "vocab-preview", lessonId: screen.lessonId });
        return;
      }

      if (screen.type === "vocab-preview") {
        setScreen({
          type: "drill-word",
          lessonId: screen.lessonId,
          index: 0,
          correctCount: 0,
        });
        return;
      }

      if (
        screen.type === "lesson-complete" ||
        screen.type === "review-done" ||
        screen.type === "stats"
      ) {
        setScreen({ type: "menu" });
      }
    },
    { isActive: staticInputActive }
  );

  function updateProgress(mutator: (current: Progress) => Progress): void {
    setProgress((current) => {
      const next = mutator(current);
      if (next !== current) {
        saveProgress(next);
      }
      return next;
    });
  }

  function updateEntry(itemId: string, grade: number): void {
    updateProgress((current) => {
      const entry = current.entries[itemId];
      if (!entry) return current;

      return {
        ...current,
        entries: {
          ...current.entries,
          [itemId]: updateSrs(entry, grade),
        },
      };
    });
  }

  function markLessonComplete(lessonId: string): void {
    updateProgress((current) => {
      if (current.completedLessons.includes(lessonId)) return current;

      return {
        ...current,
        completedLessons: [...current.completedLessons, lessonId],
      };
    });
  }

  function startReview(): void {
    const queue = getDueEntries(Object.values(progress.entries))
      .filter((entry) => {
        // 只复习已学课程的词条
        const lessonId = entry.itemId.match(/^(lesson-\d+)_/)?.[1];
        return lessonId && progress.completedLessons.includes(lessonId);
      })
      .filter((entry) => getReviewPrompt(entry) !== null)
      .map((entry) => entry.itemId);

    setScreen(
      queue.length === 0
        ? { type: "review-done", correctCount: 0, total: 0 }
        : { type: "review", queue, index: 0, correctCount: 0 }
    );
  }

  function finishLesson(
    lessonId: string,
    wordCorrect: number,
    sentenceCorrect: number
  ): void {
    markLessonComplete(lessonId);
    setScreen({
      type: "lesson-complete",
      lessonId,
      wordCorrect,
      sentenceCorrect,
    });
  }

  function renderMenu(): React.JSX.Element {
    const dueInfo =
      stats.due > 0 ? `${stats.due} 题待做` : "今天已清空";

    return (
      <Panel title="操作">
        <SelectList
          items={[
            {
              label: "学习新课",
              value: "learn",
              subtitle: "从课程中学习新词汇和语法",
            },
            {
              label: "开始复习",
              value: "review",
              subtitle: `今日到期：${dueInfo}`,
            },
            {
              label: "查看进度",
              value: "stats",
              subtitle: `已掌握 ${stats.mastered} / ${stats.total} 项`,
            },
            { label: "退出", value: "exit" },
          ]}
          onSelect={(value) => {
            if (value === "learn") setScreen({ type: "lesson-select" });
            if (value === "review") startReview();
            if (value === "stats") setScreen({ type: "stats" });
            if (value === "exit") exit();
          }}
        />
        <KeyHint />
      </Panel>
    );
  }

  function renderLessonSelect(): React.JSX.Element {
    return (
      <Panel title="选择课程">
        <SelectList
          items={[
            ...lessons.map((lesson) => {
              const done = progress.completedLessons.includes(lesson.id);
              return {
                label: `${done ? "✓ " : ""}${lesson.title}`,
                value: lesson.id,
                subtitle: done
                  ? `${lesson.description} · 已学，可重新练习`
                  : lesson.description,
              };
            }),
            { label: "返回主菜单", value: "__back" },
          ]}
          onSelect={(value) => {
            if (value === "__back") {
              setScreen({ type: "menu" });
              return;
            }

            setScreen({ type: "grammar", lessonId: value });
          }}
        />
        <KeyHint />
      </Panel>
    );
  }

  function renderGrammar(lesson: Lesson): React.JSX.Element {
    return (
      <Panel title={lesson.title} borderColor="yellow">
        <Box flexDirection="column" gap={1}>
          {lesson.grammar.map((note) => (
            <Box key={note.pattern} flexDirection="column">
              <Text bold color="yellow">
                {note.pattern}
              </Text>
              <Text>{note.explanation}</Text>
              <Text dimColor>例：{note.example}</Text>
            </Box>
          ))}
        </Box>
        <Box marginTop={1}>
          <KeyHint>Enter 查看词汇表 · Esc 返回主菜单</KeyHint>
        </Box>
      </Panel>
    );
  }

  function renderVocabPreview(lesson: Lesson): React.JSX.Element {
    return (
      <Panel title={`${lesson.title} - 词汇表`} borderColor="green">
        <Box flexDirection="column">
          {lesson.vocabulary.map((word) => (
            <Box key={word.id}>
              <Box width={18}>
                <Text color="green">{word.japanese}</Text>
              </Box>
              <Box width={26}>
                <Text>{word.english}</Text>
              </Box>
              <Text dimColor>{word.partOfSpeech}</Text>
            </Box>
          ))}
        </Box>
        <Box marginTop={1}>
          <KeyHint>Enter 开始词汇练习 · Esc 返回主菜单</KeyHint>
        </Box>
      </Panel>
    );
  }

  function renderWordDrill(
    lesson: Lesson,
    index: number,
    correctCount: number
  ): React.JSX.Element {
    const word = lesson.vocabulary[index];
    const total = lesson.vocabulary.length;

    return (
      <Box flexDirection="column">
        <ProgressBar current={index} total={total} />
        <QuestionBox
          key={word.id}
          title="词汇练习"
          progress={`${index + 1}/${total}`}
          prompt={word.english}
          hint={`词性：${word.partOfSpeech}`}
          check={(answer) => checkAnswer(answer, word.japanese)}
          onNext={(grade) => {
            updateEntry(word.id, grade);
            const nextCorrect = correctCount + (grade >= 2 ? 1 : 0);
            const nextIndex = index + 1;

            if (nextIndex < total) {
              setScreen({
                type: "drill-word",
                lessonId: lesson.id,
                index: nextIndex,
                correctCount: nextCorrect,
              });
              return;
            }

            setScreen({
              type: "drill-sentence",
              lessonId: lesson.id,
              index: 0,
              wordCorrect: nextCorrect,
              correctCount: 0,
            });
          }}
        />
      </Box>
    );
  }

  function renderSentenceDrill(
    lesson: Lesson,
    index: number,
    wordCorrect: number,
    correctCount: number
  ): React.JSX.Element {
    const sentence = lesson.sentences[index];
    const total = lesson.sentences.length;

    return (
      <Box flexDirection="column">
        <ProgressBar current={index} total={total} />
        <QuestionBox
          key={sentence.id}
          title="整句翻译"
          progress={`${index + 1}/${total}`}
          prompt={sentence.english}
          hint={sentence.grammarNote}
          check={(answer) =>
            checkAnswer(answer, sentence.japanese, sentence.alternatives)
          }
          onNext={(grade) => {
            updateEntry(sentence.id, grade);
            const nextCorrect = correctCount + (grade >= 2 ? 1 : 0);
            const nextIndex = index + 1;

            if (nextIndex < total) {
              setScreen({
                type: "drill-sentence",
                lessonId: lesson.id,
                index: nextIndex,
                wordCorrect,
                correctCount: nextCorrect,
              });
              return;
            }

            finishLesson(lesson.id, wordCorrect, nextCorrect);
          }}
        />
      </Box>
    );
  }

  function renderReview(): React.JSX.Element {
    if (screen.type !== "review") {
      return <Text />;
    }

    const itemId = screen.queue[screen.index];
    const entry = progress.entries[itemId];
    const prompt = entry ? getReviewPrompt(entry) : null;

    if (!entry || !prompt) {
      return (
        <Panel title="复习">
          <Text color="red">这个复习条目已不存在。</Text>
          <KeyHint>Esc 返回主菜单</KeyHint>
        </Panel>
      );
    }

    return (
      <Box flexDirection="column">
        <ProgressBar current={screen.index} total={screen.queue.length} />
        <QuestionBox
          key={`${entry.itemId}-${screen.index}`}
          title={prompt.title}
          progress={`${screen.index + 1}/${screen.queue.length}`}
          prompt={prompt.prompt}
          hint={prompt.hint}
          check={(answer) =>
            checkAnswer(answer, prompt.expected, prompt.alternatives)
          }
          onNext={(grade) => {
            updateEntry(entry.itemId, grade);
            const nextCorrect = screen.correctCount + (grade >= 2 ? 1 : 0);
            const nextIndex = screen.index + 1;

            if (nextIndex < screen.queue.length) {
              setScreen({
                type: "review",
                queue: screen.queue,
                index: nextIndex,
                correctCount: nextCorrect,
              });
              return;
            }

            setScreen({
              type: "review-done",
              correctCount: nextCorrect,
              total: screen.queue.length,
            });
          }}
        />
      </Box>
    );
  }

  function renderLessonComplete(screenValue: Extract<Screen, { type: "lesson-complete" }>): React.JSX.Element {
    const lesson = getLesson(screenValue.lessonId);

    return (
      <Panel title="课程完成" borderColor="green">
        <Text color="green" bold>
          {lesson?.title ?? "课程"} 完成！
        </Text>
        <Text>
          词汇：{screenValue.wordCorrect}/{lesson?.vocabulary.length ?? 0}
        </Text>
        <Text>
          句子：{screenValue.sentenceCorrect}/{lesson?.sentences.length ?? 0}
        </Text>
        <Box marginTop={1}>
          <KeyHint>Enter 回到主菜单</KeyHint>
        </Box>
      </Panel>
    );
  }

  function renderReviewDone(screenValue: Extract<Screen, { type: "review-done" }>): React.JSX.Element {
    return (
      <Panel title="复习完成" borderColor="green">
        {screenValue.total === 0 ? (
          <>
            <Text color="green" bold>
              今天没有待复习的题目。
            </Text>
            <Text dimColor>去学新课，或者明天再来。</Text>
          </>
        ) : (
          <>
            <Text color="green" bold>
              本次复习：{screenValue.correctCount}/{screenValue.total} 最终答对
            </Text>
            <ProgressBar
              current={screenValue.correctCount}
              total={screenValue.total}
            />
          </>
        )}
        <Box marginTop={1}>
          <KeyHint>Enter 回到主菜单</KeyHint>
        </Box>
      </Panel>
    );
  }

  function renderStats(): React.JSX.Element {
    return (
      <Panel title="学习进度">
        <Text>总词条数：{stats.total}</Text>
        <Text>
          今日待复习：<Text color="yellow">{stats.due}</Text>
        </Text>
        <Text>
          已掌握：<Text color="green">{stats.mastered}</Text>（稳定度 ≥ 21 天）
        </Text>

        <Box marginY={1} flexDirection="column">
          {lessons.map((lesson) => {
            const done = progress.completedLessons.includes(lesson.id);
            const lessonEntries = [
              ...lesson.vocabulary.map((word) => progress.entries[word.id]),
              ...lesson.sentences.map((sentence) => progress.entries[sentence.id]),
            ].filter((entry): entry is SrsEntry => Boolean(entry));
            const dueItems = getDueEntries(lessonEntries).length;
            const totalItems = lesson.vocabulary.length + lesson.sentences.length;
            const status = done
              ? (dueItems > 0 ? `待复习 ${dueItems}` : "已学完")
              : "未开始";

            return (
              <Box key={lesson.id}>
                <Box width={30}>
                  <Text color={done ? "green" : undefined}>
                    {done ? "✓" : "○"} {lesson.title}
                  </Text>
                </Box>
                <Box width={10}>
                  <Text dimColor>{totalItems} 项</Text>
                </Box>
                <Text color={dueItems > 0 ? "yellow" : undefined}>{status}</Text>
              </Box>
            );
          })}
        </Box>

        <KeyHint>Enter 回到主菜单</KeyHint>
      </Panel>
    );
  }

  function renderContent(): React.JSX.Element {
    if (screen.type === "menu") return renderMenu();
    if (screen.type === "lesson-select") return renderLessonSelect();
    if (screen.type === "review") return renderReview();
    if (screen.type === "review-done") return renderReviewDone(screen);
    if (screen.type === "lesson-complete") return renderLessonComplete(screen);
    if (screen.type === "stats") return renderStats();

    const lesson = getLesson(screen.lessonId);
    if (!lesson) {
      return (
        <Panel title="找不到课程" borderColor="red">
          <Text color="red">课程数据不存在。</Text>
          <KeyHint>Esc 返回主菜单</KeyHint>
        </Panel>
      );
    }

    if (screen.type === "grammar") return renderGrammar(lesson);
    if (screen.type === "vocab-preview") return renderVocabPreview(lesson);
    if (screen.type === "drill-word") {
      return renderWordDrill(lesson, screen.index, screen.correctCount);
    }

    return renderSentenceDrill(
      lesson,
      screen.index,
      screen.wordCorrect,
      screen.correctCount
    );
  }

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <TopBar progress={progress} />
      {renderContent()}
    </Box>
  );
}
