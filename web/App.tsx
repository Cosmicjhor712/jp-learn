import React, { useEffect, useMemo, useState } from "react";
import type { Lesson, Progress, SrsEntry } from "../src/types.ts";
import { checkAnswer } from "../src/exercises.ts";
import { getDueEntries, getStats, updateSrs } from "../src/srs.ts";
import {
  buildListenQueue,
  entriesForCompletedLessons,
  findLesson,
  findListenItem,
  findReviewPrompt,
  makeChoices,
} from "../src/logic.ts";
import { canSpeak, speak } from "./speech.ts";
import { loadProgress, saveProgress } from "./progressApi.ts";
import ProgressBar from "./components/ProgressBar";
import QuestionPanel from "./components/QuestionPanel";
import ChoicePanel from "./components/ChoicePanel";
import lessonsData from "../data/lessons.json";

const lessons = lessonsData as Lesson[];

type ListenMode = "dictation" | "choice";

type Screen =
  | { type: "menu" }
  | { type: "lesson-select" }
  | { type: "listen-menu" }
  | { type: "listen-lesson-select"; mode: ListenMode }
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
  | {
      type: "listen-dictation";
      lessonId: string;
      queue: string[];
      index: number;
      correctCount: number;
    }
  | {
      type: "listen-choice";
      lessonId: string;
      queue: string[];
      index: number;
      correctCount: number;
    }
  | { type: "listen-done"; mode: ListenMode; correctCount: number; total: number }
  | { type: "stats" };

function BackButton({
  onClick,
  label = "← 返回",
}: {
  onClick: () => void;
  label?: string;
}): React.JSX.Element {
  return (
    <button className="back-btn" onClick={onClick}>
      {label}
    </button>
  );
}

export default function App(): React.JSX.Element {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [screen, setScreen] = useState<Screen>({ type: "menu" });

  useEffect(() => {
    loadProgress(lessons).then(setProgress);
  }, []);

  // 进度变化后持久化
  useEffect(() => {
    if (progress) saveProgress(progress);
  }, [progress]);

  const stats = useMemo(() => {
    if (!progress) return { total: 0, due: 0, mastered: 0 };
    const trained = progress.completedLessons.length > 0;
    const relevant = trained
      ? entriesForCompletedLessons(
          Object.values(progress.entries),
          progress.completedLessons
        )
      : Object.values(progress.entries);
    return getStats(relevant);
  }, [progress]);

  function updateEntry(itemId: string, grade: number): void {
    setProgress((current) => {
      if (!current) return current;
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
    setProgress((current) => {
      if (!current || current.completedLessons.includes(lessonId)) {
        return current;
      }
      return {
        ...current,
        completedLessons: [...current.completedLessons, lessonId],
      };
    });
  }

  function startReview(): void {
    if (!progress) return;
    const queue = getDueEntries(Object.values(progress.entries))
      .filter((entry) => {
        const lessonId = entry.itemId.match(/^(lesson-\d+)_/)?.[1];
        return lessonId && progress.completedLessons.includes(lessonId);
      })
      .filter((entry) => findReviewPrompt(entry, lessons) !== null)
      .map((entry) => entry.itemId);

    setScreen(
      queue.length === 0
        ? { type: "review-done", correctCount: 0, total: 0 }
        : { type: "review", queue, index: 0, correctCount: 0 }
    );
  }

  if (!progress) {
    return <div className="loading">正在加载学习进度…</div>;
  }
  const current = progress;

  function renderMenu(): React.JSX.Element {
    return (
      <div className="card">
        <div className="card-head">
          <strong>操作</strong>
        </div>
        <div className="menu-list">
          <button
            className="menu-btn"
            onClick={() => setScreen({ type: "lesson-select" })}
          >
            <span>📖 学习新课</span>
            <span className="muted">从课程中学习新词汇和语法</span>
          </button>
          <button className="menu-btn" onClick={startReview}>
            <span>🔁 开始复习</span>
            <span className="muted">
              {stats.due > 0 ? `今日到期：${stats.due} 题` : "今天已清空"}
            </span>
          </button>
          <button
            className="menu-btn"
            onClick={() => setScreen({ type: "listen-menu" })}
          >
            <span>🎧 听力练习</span>
            <span className="muted">
              {canSpeak ? "听写 + 理解选择，巩固已学课程" : "当前浏览器不支持语音"}
            </span>
          </button>
          <button
            className="menu-btn"
            onClick={() => setScreen({ type: "stats" })}
          >
            <span>📊 查看进度</span>
            <span className="muted">已掌握 {stats.mastered} / {stats.total} 项</span>
          </button>
        </div>
      </div>
    );
  }

  function renderLessonSelect(): React.JSX.Element {
    return (
      <div className="card">
        <div className="card-head">
          <strong>选择课程</strong>
          <BackButton onClick={() => setScreen({ type: "menu" })} />
        </div>
        <div className="menu-list">
          {lessons.map((lesson) => {
            const done = current.completedLessons.includes(lesson.id);
            return (
              <button
                key={lesson.id}
                className="menu-btn"
                onClick={() => setScreen({ type: "grammar", lessonId: lesson.id })}
              >
                <span>
                  {done ? "✅ " : ""}
                  {lesson.title}
                </span>
                <span className="muted">
                  {done ? `${lesson.description} · 已学，可重新练习` : lesson.description}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  function renderGrammar(lessonId: string): React.JSX.Element {
    const lesson = findLesson(lessons, lessonId);
    if (!lesson) return <div className="bad">课程不存在。</div>;
    return (
      <div className="card">
        <div className="card-head">
          <strong>{lesson.title}</strong>
          <BackButton onClick={() => setScreen({ type: "lesson-select" })} />
        </div>
        {lesson.grammar.map((note) => (
          <div key={note.pattern} className="grammar-note">
            <div className="pattern">{note.pattern}</div>
            <div>{note.explanation}</div>
            <div className="hint">例：{note.example}</div>
          </div>
        ))}
        <button
          className="primary-btn"
          onClick={() =>
            setScreen({ type: "vocab-preview", lessonId: lesson.id })
          }
        >
          查看词汇表 →
        </button>
      </div>
    );
  }

  function renderVocabPreview(lessonId: string): React.JSX.Element {
    const lesson = findLesson(lessons, lessonId);
    if (!lesson) return <div className="bad">课程不存在。</div>;
    return (
      <div className="card">
        <div className="card-head">
          <strong>{lesson.title} - 词汇表</strong>
          <BackButton onClick={() => setScreen({ type: "grammar", lessonId })} />
        </div>
        <div className="vocab-list">
          {lesson.vocabulary.map((word) => (
            <div key={word.id} className="vocab-row">
              <span className="jp">{word.japanese}</span>
              <span>{word.english}</span>
              <span className="muted">{word.partOfSpeech}</span>
            </div>
          ))}
        </div>
        <button
          className="primary-btn"
          onClick={() =>
            setScreen({
              type: "drill-word",
              lessonId: lesson.id,
              index: 0,
              correctCount: 0,
            })
          }
        >
          开始词汇练习 →
        </button>
      </div>
    );
  }

  function renderWordDrill(
    lessonId: string,
    index: number,
    correctCount: number
  ): React.JSX.Element {
    const lesson = findLesson(lessons, lessonId);
    if (!lesson) return <div className="bad">课程不存在。</div>;
    const word = lesson.vocabulary[index];

    return (
      <div>
        <ProgressBar current={index} total={lesson.vocabulary.length} />
        <QuestionPanel
          key={word.id}
          title="词汇练习"
          progress={`${index + 1}/${lesson.vocabulary.length}`}
          prompt={word.english}
          hint={`词性：${word.partOfSpeech}`}
          check={(answer) => checkAnswer(answer, word.japanese)}
          onNext={(grade) => {
            updateEntry(word.id, grade);
            const nextCorrect = correctCount + (grade >= 2 ? 1 : 0);
            const nextIndex = index + 1;
            if (nextIndex < lesson.vocabulary.length) {
              setScreen({
                type: "drill-word",
                lessonId,
                index: nextIndex,
                correctCount: nextCorrect,
              });
            } else {
              setScreen({
                type: "drill-sentence",
                lessonId,
                index: 0,
                wordCorrect: nextCorrect,
                correctCount: 0,
              });
            }
          }}
        />
      </div>
    );
  }

  function renderSentenceDrill(
    lessonId: string,
    index: number,
    wordCorrect: number,
    correctCount: number
  ): React.JSX.Element {
    const lesson = findLesson(lessons, lessonId);
    if (!lesson) return <div className="bad">课程不存在。</div>;
    const sentence = lesson.sentences[index];

    return (
      <div>
        <ProgressBar current={index} total={lesson.sentences.length} />
        <QuestionPanel
          key={sentence.id}
          title="整句翻译"
          progress={`${index + 1}/${lesson.sentences.length}`}
          prompt={sentence.english}
          hint={sentence.grammarNote}
          check={(answer) =>
            checkAnswer(answer, sentence.japanese, sentence.alternatives)
          }
          onNext={(grade) => {
            updateEntry(sentence.id, grade);
            const nextCorrect = correctCount + (grade >= 2 ? 1 : 0);
            const nextIndex = index + 1;
            if (nextIndex < lesson.sentences.length) {
              setScreen({
                type: "drill-sentence",
                lessonId,
                index: nextIndex,
                wordCorrect,
                correctCount: nextCorrect,
              });
            } else {
              markLessonComplete(lessonId);
              setScreen({
                type: "lesson-complete",
                lessonId,
                wordCorrect,
                sentenceCorrect: nextCorrect,
              });
            }
          }}
        />
      </div>
    );
  }

  function renderReview(queue: string[], index: number, correctCount: number): React.JSX.Element {
    const itemId = queue[index];
    const entry = current.entries[itemId];
    const prompt = entry ? findReviewPrompt(entry, lessons) : null;

    if (!entry || !prompt) {
      return (
        <div className="card">
          <div className="bad">这个复习条目已不存在。</div>
          <BackButton onClick={() => setScreen({ type: "menu" })} />
        </div>
      );
    }

    return (
      <div>
        <ProgressBar current={index} total={queue.length} />
        <QuestionPanel
          key={`${entry.itemId}-${index}`}
          title={prompt.title}
          progress={`${index + 1}/${queue.length}`}
          prompt={prompt.prompt}
          hint={prompt.hint}
          check={(answer) =>
            checkAnswer(answer, prompt.expected, prompt.alternatives)
          }
          onNext={(grade) => {
            updateEntry(entry.itemId, grade);
            const nextCorrect = correctCount + (grade >= 2 ? 1 : 0);
            const nextIndex = index + 1;
            if (nextIndex < queue.length) {
              setScreen({
                type: "review",
                queue,
                index: nextIndex,
                correctCount: nextCorrect,
              });
            } else {
              setScreen({
                type: "review-done",
                correctCount: nextCorrect,
                total: queue.length,
              });
            }
          }}
        />
      </div>
    );
  }

  function renderListenMenu(): React.JSX.Element {
    return (
      <div className="card">
        <div className="card-head">
          <strong>听力练习</strong>
          <BackButton onClick={() => setScreen({ type: "menu" })} />
        </div>
        <div className="menu-list">
          <button
            className="menu-btn"
            onClick={() =>
              setScreen({ type: "listen-lesson-select", mode: "dictation" })
            }
          >
            <span>✍️ 听写模式</span>
            <span className="muted">听日语，打出你听到的内容</span>
          </button>
          <button
            className="menu-btn"
            onClick={() =>
              setScreen({ type: "listen-lesson-select", mode: "choice" })
            }
          >
            <span>🖱️ 理解选择</span>
            <span className="muted">听日语，选择对应的中文意思</span>
          </button>
        </div>
        {!canSpeak ? (
          <div className="warn">当前浏览器不支持语音合成，题目将无法播放音频。</div>
        ) : null}
      </div>
    );
  }

  function renderListenLessonSelect(mode: ListenMode): React.JSX.Element {
    const completed = lessons.filter((lesson) =>
      current.completedLessons.includes(lesson.id)
    );

    return (
      <div className="card">
        <div className="card-head">
          <strong>{mode === "dictation" ? "听写模式" : "理解选择"} - 选择课程</strong>
          <BackButton onClick={() => setScreen({ type: "listen-menu" })} />
        </div>
        {completed.length === 0 ? (
          <div className="hint">
            还没有已学完的课程，先通过“学习新课”完成至少一节课。
          </div>
        ) : (
          <div className="menu-list">
            {completed.map((lesson) => (
              <button
                key={lesson.id}
                className="menu-btn"
                onClick={() => {
                  const queue = buildListenQueue(lesson);
                  setScreen(
                    mode === "dictation"
                      ? {
                          type: "listen-dictation",
                          lessonId: lesson.id,
                          queue,
                          index: 0,
                          correctCount: 0,
                        }
                      : {
                          type: "listen-choice",
                          lessonId: lesson.id,
                          queue,
                          index: 0,
                          correctCount: 0,
                        }
                  );
                }}
              >
                <span>{lesson.title}</span>
                <span className="muted">{lesson.description}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  function renderListenDictation(
    lessonId: string,
    queue: string[],
    index: number,
    correctCount: number
  ): React.JSX.Element {
    const lesson = findLesson(lessons, lessonId);
    const item = findListenItem(queue[index], lessons);
    if (!lesson || !item) {
      return <div className="bad">练习条目不存在。</div>;
    }

    return (
      <div>
        <ProgressBar current={index} total={queue.length} />
        <QuestionPanel
          key={item.id}
          title="听力听写"
          progress={`${index + 1}/${queue.length}`}
          prompt="请听下面的日语，输入你听到的内容"
          hint={item.hint}
          check={(answer) => checkAnswer(answer, item.japanese, item.alternatives)}
          play={(slow) => speak(item.japanese, slow)}
          onNext={(grade) => {
            updateEntry(item.id, grade);
            const nextCorrect = correctCount + (grade >= 2 ? 1 : 0);
            const nextIndex = index + 1;
            if (nextIndex < queue.length) {
              setScreen({
                type: "listen-dictation",
                lessonId,
                queue,
                index: nextIndex,
                correctCount: nextCorrect,
              });
            } else {
              setScreen({
                type: "listen-done",
                mode: "dictation",
                correctCount: nextCorrect,
                total: queue.length,
              });
            }
          }}
        />
      </div>
    );
  }

  function renderListenChoice(
    lessonId: string,
    queue: string[],
    index: number,
    correctCount: number
  ): React.JSX.Element {
    const lesson = findLesson(lessons, lessonId);
    const item = findListenItem(queue[index], lessons);
    if (!lesson || !item) {
      return <div className="bad">练习条目不存在。</div>;
    }
    const { choices, correctIndex } = makeChoices(item, lesson.id, lessons);

    return (
      <div>
        <ProgressBar current={index} total={queue.length} />
        <ChoicePanel
          key={item.id}
          title="听力理解"
          progress={`${index + 1}/${queue.length}`}
          question={item.kind === "word" ? "这个词的意思是？" : "这句话的意思是？"}
          choices={choices}
          correctIndex={correctIndex}
          play={(slow) => speak(item.japanese, slow)}
          onNext={(grade) => {
            updateEntry(item.id, grade);
            const nextCorrect = correctCount + (grade >= 2 ? 1 : 0);
            const nextIndex = index + 1;
            if (nextIndex < queue.length) {
              setScreen({
                type: "listen-choice",
                lessonId,
                queue,
                index: nextIndex,
                correctCount: nextCorrect,
              });
            } else {
              setScreen({
                type: "listen-done",
                mode: "choice",
                correctCount: nextCorrect,
                total: queue.length,
              });
            }
          }}
        />
      </div>
    );
  }

  function renderDone(kind: "复习" | "听力练习", correctCount: number, total: number, mode?: ListenMode): React.JSX.Element {
    return (
      <div className="card card-ok">
        <div className="card-head">
          <strong>{kind}完成</strong>
          <BackButton onClick={() => setScreen({ type: "menu" })} label="返回主菜单" />
        </div>
        {total === 0 ? (
          <div>
            <div className="ok-text">今天没有待做的题目。</div>
            <div className="hint">去学新课，或者明天再来。</div>
          </div>
        ) : (
          <>
            <div>
              {mode
                ? `${mode === "dictation" ? "听写" : "理解选择"}完成！`
                : `本次${kind}：`}
              答对 {correctCount}/{total}
            </div>
            <ProgressBar current={correctCount} total={total} />
          </>
        )}
      </div>
    );
  }

  function renderStats(): React.JSX.Element {
    return (
      <div className="card">
        <div className="card-head">
          <strong>学习进度</strong>
          <BackButton onClick={() => setScreen({ type: "menu" })} />
        </div>
        <div className="stat-line">
          总词条数：<b>{stats.total}</b>
        </div>
        <div className="stat-line">
          今日待复习：<b className={stats.due > 0 ? "warn-text" : "ok-text"}>{stats.due}</b>
        </div>
        <div className="stat-line">
          已掌握：<b className="ok-text">{stats.mastered}</b>
          <span className="muted">（稳定度 ≥ 21 天）</span>
        </div>
        <div className="lesson-stats">
          {lessons.map((lesson) => {
            const done = current.completedLessons.includes(lesson.id);
            const lessonEntries = [
              ...lesson.vocabulary.map((word) => current.entries[word.id]),
              ...lesson.sentences.map((sentence) => current.entries[sentence.id]),
            ].filter((entry): entry is SrsEntry => Boolean(entry));
            const dueItems = getDueEntries(lessonEntries).length;
            const totalItems = lesson.vocabulary.length + lesson.sentences.length;
            const status = done
              ? dueItems > 0
                ? `待复习 ${dueItems}`
                : "已学完"
              : "未开始";
            return (
              <div key={lesson.id} className="lesson-stat-row">
                <span className={done ? "ok-text" : ""}>
                  {done ? "✅" : "○"} {lesson.title}
                </span>
                <span className="muted">{totalItems} 项</span>
                <span className={dueItems > 0 ? "warn-text" : ""}>{status}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function renderContent(): React.JSX.Element {
    switch (screen.type) {
      case "menu":
        return renderMenu();
      case "lesson-select":
        return renderLessonSelect();
      case "grammar":
        return renderGrammar(screen.lessonId);
      case "vocab-preview":
        return renderVocabPreview(screen.lessonId);
      case "drill-word":
        return renderWordDrill(screen.lessonId, screen.index, screen.correctCount);
      case "drill-sentence":
        return renderSentenceDrill(
          screen.lessonId,
          screen.index,
          screen.wordCorrect,
          screen.correctCount
        );
      case "lesson-complete": {
        const lesson = findLesson(lessons, screen.lessonId);
        return (
          <div className="card card-ok">
            <div className="card-head">
              <strong>课程完成</strong>
              <BackButton onClick={() => setScreen({ type: "menu" })} label="返回主菜单" />
            </div>
            <div className="ok-text">{lesson?.title ?? "课程"} 完成！</div>
            <div>
              词汇：{screen.wordCorrect}/{lesson?.vocabulary.length ?? 0}
            </div>
            <div>
              句子：{screen.sentenceCorrect}/{lesson?.sentences.length ?? 0}
            </div>
          </div>
        );
      }
      case "review":
        return renderReview(screen.queue, screen.index, screen.correctCount);
      case "review-done":
        return renderDone("复习", screen.correctCount, screen.total);
      case "listen-menu":
        return renderListenMenu();
      case "listen-lesson-select":
        return renderListenLessonSelect(screen.mode);
      case "listen-dictation":
        return renderListenDictation(
          screen.lessonId,
          screen.queue,
          screen.index,
          screen.correctCount
        );
      case "listen-choice":
        return renderListenChoice(
          screen.lessonId,
          screen.queue,
          screen.index,
          screen.correctCount
        );
      case "listen-done":
        return renderDone(
          "听力练习",
          screen.correctCount,
          screen.total,
          screen.mode
        );
      case "stats":
        return renderStats();
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <strong>日本語学習</strong>
        <span className="muted">
          {stats.due} 待复习 · {stats.mastered}/{stats.total} 掌握
        </span>
      </header>
      <main>{renderContent()}</main>
    </div>
  );
}
