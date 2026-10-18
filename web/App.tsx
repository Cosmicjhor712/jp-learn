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
import { canSpeak, speak, stopSpeaking, ttsStatus } from "./speech.ts";
import {
  getSessionApiKey,
  isTtsSkipped,
} from "./ttsSettings.ts";
import { loadProgress, saveProgress } from "./progressApi.ts";
import ProgressBar from "./components/ProgressBar";
import QuestionPanel from "./components/QuestionPanel";
import ChoicePanel from "./components/ChoicePanel";
import TtsSetup from "./components/TtsSetup";
import lessonsData from "../data/lessons.json";
import {
  ArrowRight,
  ArrowUpRight,
  ChartNoAxesColumnIncreasing,
  ChevronRight,
  House,
} from "lucide-react";
import KanaPractice from "./components/KanaPractice.tsx";
import KanaAnnotation from "./components/KanaAnnotation.tsx";
import { useInputLearning } from "./inputLearning.tsx";
import ScenarioLesson, {
  ScenarioReport,
  ScenarioFocus,
  FocusResult,
} from "./scenario/ScenarioLesson.tsx";
import type { ScenarioProgress } from "./scenario/progress.ts";
import { stages } from "./scenario/content.ts";
import { getScenario, scenarioCourses } from "./scenario/catalogue.ts";
import LearningHome, { formatAttemptDate } from "./scenario/LearningHome.tsx";
import PracticeRadar from "./scenario/PracticeRadar.tsx";
import RevisitLesson, { RevisitOutcome } from "./scenario/RevisitLesson.tsx";
import {
  startRevisit,
  finishRevisit,
  revisitUnlockedStep,
  noteExposure,
} from "./scenario/revisit.ts";
import { findVariant } from "./scenario/variants.ts";
import {
  loadLibrary,
  LIBRARY_STORAGE_KEY,
  updateCourse,
  startFocus,
  finishFocus,
  type PracticeTarget,
} from "./scenario/library.ts";

const lessons = lessonsData as Lesson[];

type ListenMode = "dictation" | "choice";

type Screen =
  | { type: "menu" }
  | { type: "scenario" }
  | { type: "scenario-focus" }
  | { type: "scenario-revisit" }
  | { type: "scenario-attempt"; index: number }
  | { type: "kana-practice" }
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
  | {
      type: "listen-done";
      mode: ListenMode;
      correctCount: number;
      total: number;
    }
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
  const { preferences, history } = useInputLearning();
  const [progress, setProgress] = useState<Progress | null>(null);
  const [screen, setScreen] = useState<Screen>({ type: "menu" });
  const [showTtsSetup, setShowTtsSetup] = useState(false);

  useEffect(() => {
    let alive = true;
    ttsStatus().then((status) => {
      if (!alive) return;
      if (status?.configured) return; // 服务端 .env 已配置
      if (getSessionApiKey() || isTtsSkipped()) return;
      setShowTtsSetup(true);
    });
    return () => {
      alive = false;
    };
  }, []);
  const [library, setLibrary] = useState(loadLibrary);
  const scenario = library.courses[library.selectedId];
  const [scenarioSaveError, setScenarioSaveError] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(library));
      setScenarioSaveError(false);
    } catch {
      setScenarioSaveError(true);
    }
  }, [library]);

  function openCourse(id: string): void {
    const baseId = findVariant(id)?.baseId ?? id;
    setLibrary((current) => ({
      ...noteExposure(current, baseId),
      selectedId: baseId,
    }));
    setScreen({ type: "scenario" });
  }

  function openAttempt(index: number): void {
    setLibrary((current) =>
      current.attempts[index]
        ? noteExposure(current, current.attempts[index].lessonId)
        : current,
    );
    setScreen({ type: "scenario-attempt", index });
  }

  function openRevisit(baseId: string): void {
    if (library.focus) {
      setScreen({ type: "scenario-focus" });
      return;
    }
    const next = startRevisit(library, baseId);
    if (!next.revisit) return;
    setLibrary(next);
    setScreen({ type: "scenario-revisit" });
  }

  function changeRevisit(action: React.SetStateAction<ScenarioProgress>): void {
    setLibrary((current) =>
      current.revisit
        ? {
            ...current,
            revisit: {
              ...current.revisit,
              progress:
                typeof action === "function"
                  ? action(current.revisit.progress)
                  : action,
            },
          }
        : current,
    );
  }

  function completeRevisit(): void {
    const next = finishRevisit(library);
    if (next === library) return;
    setLibrary(next);
    setScreen({ type: "scenario-attempt", index: next.attempts.length - 1 });
  }

  function changeScenario(
    action: React.SetStateAction<ScenarioProgress>,
  ): void {
    const id = library.selectedId;
    setLibrary((current) =>
      updateCourse(
        current,
        id,
        typeof action === "function" ? action(current.courses[id]) : action,
      ),
    );
  }

  function openFocus(target: PracticeTarget): void {
    if (library.revisit) {
      setScreen({ type: "scenario-revisit" });
      return;
    }
    setLibrary((current) => startFocus(current, target));
    setScreen({ type: "scenario-focus" });
  }

  function changeFocus(action: React.SetStateAction<ScenarioProgress>): void {
    setLibrary((current) =>
      current.focus
        ? {
            ...current,
            focus: {
              ...current.focus,
              progress:
                typeof action === "function"
                  ? action(current.focus.progress)
                  : action,
            },
          }
        : current,
    );
  }

  function completeFocus(): void {
    const next = finishFocus(library);
    if (next === library) return;
    setLibrary(next);
    setScreen({ type: "scenario-attempt", index: next.attempts.length - 1 });
  }

  function returnHome(): void {
    stopSpeaking();
    setScreen({ type: "menu" });
  }

  useEffect(() => {
    loadProgress(lessons).then(setProgress);
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen.type]);

  // 进度变化后持久化
  useEffect(() => {
    if (progress) saveProgress(progress);
  }, [progress]);

  const reviewQueue = useMemo(() => {
    if (!progress) return [];
    return getDueEntries(
      entriesForCompletedLessons(
        Object.values(progress.entries),
        progress.completedLessons,
      ),
    )
      .filter((entry) => findReviewPrompt(entry, lessons) !== null)
      .map((entry) => entry.itemId);
  }, [progress]);

  const stats = useMemo(() => {
    if (!progress) return { total: 0, due: 0, mastered: 0 };
    const trained = progress.completedLessons.length > 0;
    const relevant = trained
      ? entriesForCompletedLessons(
          Object.values(progress.entries),
          progress.completedLessons,
        )
      : Object.values(progress.entries);
    return { ...getStats(relevant), due: reviewQueue.length };
  }, [progress, reviewQueue]);

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
    setScreen(
      reviewQueue.length === 0
        ? { type: "review-done", correctCount: 0, total: 0 }
        : { type: "review", queue: reviewQueue, index: 0, correctCount: 0 },
    );
  }

  if (!progress) {
    return <div className="loading">正在加载学习进度…</div>;
  }
  const current = progress;

  function renderMenu(): React.JSX.Element {
    const completedCount = lessons.filter((lesson) =>
      current.completedLessons.includes(lesson.id),
    ).length;
    const nextLesson = lessons.find(
      (lesson) => !current.completedLessons.includes(lesson.id),
    );
    const practiceAttempts = Object.values(history).reduce(
      (total, item) => total + item.attempts,
      0,
    );
    return (
      <LearningHome
        library={library}
        saveError={scenarioSaveError}
        onCourse={openCourse}
        onFocus={openFocus}
        onRevisit={openRevisit}
        onAttempt={openAttempt}
        foundation={{
          due: stats.due,
          completed: completedCount,
          total: lessons.length,
          kanaAttempts: practiceAttempts,
          canListen: canSpeak && completedCount > 0,
          nextTitle: nextLesson?.title,
          onReview: startReview,
          onLessons: () => setScreen({ type: "lesson-select" }),
          onNext: () => {
            if (nextLesson)
              setScreen({ type: "grammar", lessonId: nextLesson.id });
          },
          onKana: () => setScreen({ type: "kana-practice" }),
          onListen: () => setScreen({ type: "listen-menu" }),
          onVoiceSettings: () => setShowTtsSetup(true),
        }}
      />
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
                onClick={() =>
                  setScreen({ type: "grammar", lessonId: lesson.id })
                }
              >
                <span>
                  {done ? "✅ " : ""}
                  {lesson.title}
                </span>
                <span className="muted">
                  {done
                    ? `${lesson.description} · 已学，可重新练习`
                    : lesson.description}
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
          <BackButton
            onClick={() => setScreen({ type: "grammar", lessonId })}
          />
        </div>
        <div className="vocab-list">
          {lesson.vocabulary.map((word) => (
            <div key={word.id} className="vocab-row">
              <span className="jp">
                <KanaAnnotation
                  text={word.japanese}
                  annotate={preferences.help !== "manual"}
                />
              </span>
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
    correctCount: number,
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
          expected={word.japanese}
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
    correctCount: number,
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
          expected={sentence.japanese}
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

  function renderReview(
    queue: string[],
    index: number,
    correctCount: number,
  ): React.JSX.Element {
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
          expected={prompt.expected}
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
          <div className="warn">
            当前浏览器不支持语音合成，题目将无法播放音频。
          </div>
        ) : null}
      </div>
    );
  }

  function renderListenLessonSelect(mode: ListenMode): React.JSX.Element {
    const completed = lessons.filter((lesson) =>
      current.completedLessons.includes(lesson.id),
    );

    return (
      <div className="card">
        <div className="card-head">
          <strong>
            {mode === "dictation" ? "听写模式" : "理解选择"} - 选择课程
          </strong>
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
                        },
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
    correctCount: number,
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
          expected={item.japanese}
          hint={item.hint}
          check={(answer) =>
            checkAnswer(answer, item.japanese, item.alternatives)
          }
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
    correctCount: number,
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
          question={
            item.kind === "word" ? "这个词的意思是？" : "这句话的意思是？"
          }
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

  function renderDone(
    kind: "复习" | "听力练习",
    correctCount: number,
    total: number,
    mode?: ListenMode,
  ): React.JSX.Element {
    return (
      <div className="card card-ok">
        <div className="card-head">
          <strong>{kind}完成</strong>
          <BackButton
            onClick={() => setScreen({ type: "menu" })}
            label="返回主菜单"
          />
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
      <div className="learning-progress">
        <div className="card-head">
          <h1>学习进度</h1>
          <BackButton onClick={() => setScreen({ type: "menu" })} />
        </div>
        <PracticeRadar
          library={library}
          onFocus={openFocus}
          onCourse={openCourse}
          onRevisit={openRevisit}
          onAttempt={openAttempt}
        />
        <section className="scenario-stats" aria-label="情景课进度">
          <h2>逐课进度</h2>
          {scenarioCourses.map((course) => {
            const record = library.courses[course.id];
            return (
              <details
                className="scenario-course-progress"
                key={course.id}
                open={course.id === library.selectedId}
              >
                <summary>
                  <div>
                    <h3>{course.title}</h3>
                    <p className="muted">
                      累计完成 {record.completedRuns} 轮 · 当前：
                      {stages[record.stage]}
                    </p>
                  </div>
                  <ChevronRight size={17} aria-hidden="true" />
                </summary>
                <ScenarioReport progress={record} />
                <button
                  type="button"
                  className="home-link"
                  onClick={() => openCourse(course.id)}
                >
                  进入情景课
                  <ArrowRight size={17} />
                </button>
              </details>
            );
          })}
        </section>
        <details className="foundation-progress">
          <summary>基础巩固进度</summary>
          <div className="stat-line">
            总词条数：<b>{stats.total}</b>
          </div>
          <div className="stat-line">
            今日待复习：
            <b className={stats.due > 0 ? "warn-text" : "ok-text"}>
              {stats.due}
            </b>
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
                ...lesson.sentences.map(
                  (sentence) => current.entries[sentence.id],
                ),
              ].filter((entry): entry is SrsEntry => Boolean(entry));
              const dueItems = getDueEntries(lessonEntries).length;
              const totalItems =
                lesson.vocabulary.length + lesson.sentences.length;
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
                  <span className={dueItems > 0 ? "warn-text" : ""}>
                    {status}
                  </span>
                </div>
              );
            })}
          </div>
        </details>
      </div>
    );
  }

  function renderContent(): React.JSX.Element {
    switch (screen.type) {
      case "menu":
        return renderMenu();
      case "scenario":
        return (
          <ScenarioLesson
            key={scenario.lessonId}
            progress={scenario}
            onChange={changeScenario}
            onRelatedCourse={openCourse}
            saveError={scenarioSaveError}
            onHome={returnHome}
            onNextCourse={
              scenarioCourses[
                scenarioCourses.findIndex((c) => c.id === scenario.lessonId) + 1
              ]
                ? () =>
                    openCourse(
                      scenarioCourses[
                        scenarioCourses.findIndex(
                          (c) => c.id === scenario.lessonId,
                        ) + 1
                      ].id,
                    )
                : undefined
            }
          />
        );
      case "scenario-focus":
        return library.focus ? (
          <ScenarioFocus
            run={library.focus}
            onChange={changeFocus}
            onFinish={completeFocus}
            saveError={scenarioSaveError}
          />
        ) : (
          renderMenu()
        );
      case "scenario-revisit":
        return library.revisit ? (
          <RevisitLesson
            run={library.revisit}
            onChange={changeRevisit}
            onStep={(step) =>
              setLibrary((current) =>
                current.revisit &&
                step >= 0 &&
                step <=
                  Math.min(3, revisitUnlockedStep(current.revisit.progress))
                  ? { ...current, revisit: { ...current.revisit, step } }
                  : current,
              )
            }
            onFinish={completeRevisit}
            saveError={scenarioSaveError}
          />
        ) : (
          renderMenu()
        );
      case "scenario-attempt": {
        const attempt = library.attempts[screen.index];
        if (!attempt) return renderMenu();
        return (
          <div className="scenario-lesson">
            <div className="history-attempt-heading">
              <span className="scenario-eyebrow">
                {attempt.kind === "lesson"
                  ? "完整课程回顾"
                  : attempt.kind === "revisit"
                    ? "变体练习回顾"
                    : "单项练习回顾"}
              </span>
              <h1>{getScenario(attempt.lessonId).title}</h1>
              <time className="muted" dateTime={attempt.completedAt}>
                {formatAttemptDate(attempt.completedAt)}
              </time>
            </div>
            {scenarioSaveError && (
              <p className="scenario-notice" role="alert">
                本次记录暂时无法保存，刷新可能丢失。
              </p>
            )}
            {attempt.kind === "revisit" ? (
              <RevisitOutcome attempt={attempt} library={library} />
            ) : (
              <FocusResult attempt={attempt} />
            )}
            <footer className="scenario-footer">
              <button
                type="button"
                className="home-link"
                onClick={() => openCourse(attempt.lessonId)}
              >
                进入课程
                <ArrowRight size={17} />
              </button>
              <button
                type="button"
                className="home-primary"
                onClick={returnHome}
              >
                回到首页
                <House size={17} />
              </button>
            </footer>
          </div>
        );
      }
      case "kana-practice":
        return <KanaPractice onBack={() => setScreen({ type: "menu" })} />;
      case "lesson-select":
        return renderLessonSelect();
      case "grammar":
        return renderGrammar(screen.lessonId);
      case "vocab-preview":
        return renderVocabPreview(screen.lessonId);
      case "drill-word":
        return renderWordDrill(
          screen.lessonId,
          screen.index,
          screen.correctCount,
        );
      case "drill-sentence":
        return renderSentenceDrill(
          screen.lessonId,
          screen.index,
          screen.wordCorrect,
          screen.correctCount,
        );
      case "lesson-complete": {
        const lesson = findLesson(lessons, screen.lessonId);
        return (
          <div className="card card-ok">
            <div className="card-head">
              <strong>课程完成</strong>
              <BackButton
                onClick={() => setScreen({ type: "menu" })}
                label="返回主菜单"
              />
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
          screen.correctCount,
        );
      case "listen-choice":
        return renderListenChoice(
          screen.lessonId,
          screen.queue,
          screen.index,
          screen.correctCount,
        );
      case "listen-done":
        return renderDone(
          "听力练习",
          screen.correctCount,
          screen.total,
          screen.mode,
        );
      case "stats":
        return renderStats();
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <strong>日本語学習</strong>
        {screen.type === "menu" ? (
          <button
            type="button"
            className="home-link topbar-progress"
            onClick={() => setScreen({ type: "stats" })}
          >
            <ChartNoAxesColumnIncreasing size={16} aria-hidden="true" />
            查看进度
            <ArrowUpRight size={14} aria-hidden="true" />
          </button>
        ) : (
          <span className="muted topbar-stats">
            {screen.type.startsWith("scenario") || screen.type === "stats"
              ? "日常交流 · 阅读"
              : `${stats.due} 待复习 · ${stats.mastered}/${stats.total} 掌握`}
          </span>
        )}
        {screen.type !== "menu" ? (
          <button
            type="button"
            className="home-button"
            title="返回主界面"
            onClick={returnHome}
          >
            <House size={16} aria-hidden="true" />
            返回主界面
          </button>
        ) : null}
      </header>
      <main>{renderContent()}</main>
      {showTtsSetup ? (
        <TtsSetup onClose={() => setShowTtsSetup(false)} />
      ) : null}
    </div>
  );
}
