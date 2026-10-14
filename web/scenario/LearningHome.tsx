import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  Check,
  ChevronRight,
  Headphones,
  Keyboard,
  MessageCircle,
  RotateCcw,
} from "lucide-react";
import {
  scenarioCourses,
  getScenario,
  courseUnits,
  getCourseUnit,
} from "./catalogue.ts";
import { stages } from "./content.ts";
import { meaningScore } from "./progress.ts";
import {
  hasStarted,
  recommendedPractice,
  recommendedCourse,
  targetTitle,
  type LearningLibrary,
  type PracticeTarget,
  type SavedAttempt,
} from "./library.ts";
import RevisitHome from "./RevisitHome.tsx";

export function attemptSummary(attempt: SavedAttempt): string {
  const progress = attempt.progress;
  const course = getScenario(attempt.lessonId);
  if (attempt.kind === "focus" && attempt.skill === "speaking") {
    const rating = progress.speaking[attempt.promptId!]?.rating;
    return `口语自评：${rating === "independent" ? "能独立表达" : rating === "assisted" ? "需要参考" : "还想练习"}`;
  }
  if (attempt.kind === "focus") {
    const score = meaningScore(
      progress,
      attempt.skill === "reading" ? "reading" : "listening",
    );
    return `${attempt.skill === "reading" ? "阅读理解" : progress.heard ? "听力理解" : "对话文字理解"}：答对 ${score.correct}/${score.total}`;
  }
  const listening = meaningScore(progress, "listening");
  const reading = meaningScore(progress, "reading");
  const speaking = course.responsePrompts.filter(
    (p) => progress.speaking[p.id]?.rating === "independent",
  ).length;
  return `${progress.heard ? "听力理解" : "对话文字理解"} ${listening.correct}/${listening.total} · 阅读理解 ${reading.correct}/${reading.total} · 回应自评 ${speaking}/${course.responsePrompts.length} 可独立表达`;
}
export const formatAttemptDate = (date: string): string =>
  new Date(date).toLocaleString("zh-CN", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function LearningHome({
  library,
  saveError,
  onCourse,
  onFocus,
  onRevisit,
  onAttempt,
  foundation,
}: {
  library: LearningLibrary;
  saveError: boolean;
  onCourse: (id: string) => void;
  onFocus: (target: PracticeTarget) => void;
  onRevisit: (baseId: string) => void;
  onAttempt: (index: number) => void;
  foundation: {
    due: number;
    completed: number;
    total: number;
    kanaAttempts: number;
    canListen: boolean;
    nextTitle?: string;
    onReview: () => void;
    onLessons: () => void;
    onNext: () => void;
    onKana: () => void;
    onListen: () => void;
  };
}) {
  const course = getScenario(recommendedCourse(library));
  const progress = library.courses[course.id];
  const latest = library.attempts.at(-1);
  const completed = scenarioCourses.filter(
    (item) => library.courses[item.id].completedRuns > 0,
  ).length;
  const recommendation = recommendedPractice(library);
  const revisit = !!progress.completedAt;
  const activeUnit = getCourseUnit(
    library.revisit?.baseId ??
      library.focus?.lessonId ??
      (revisit ? recommendation.lessonId : course.id),
  );
  function primaryAction() {
    if (library.revisit) onRevisit(library.revisit.baseId);
    else if (library.focus) onFocus(library.focus);
    else if (revisit) onFocus(recommendation);
    else onCourse(course.id);
  }
  return (
    <div className="learning-home conversation-home">
      <div className="home-heading">
        <h1>今日学习</h1>
        <span className="home-date">
          <CalendarDays size={15} />
          {new Date().toLocaleDateString("zh-CN", {
            month: "long",
            day: "numeric",
            weekday: "long",
          })}
        </span>
      </div>
      <RevisitHome library={library} onRevisit={onRevisit} onFocus={onFocus} />
      <section className="home-main-goal" aria-label="今天练什么">
        <div className="home-section-heading">
          <h2>
            <MessageCircle size={18} />
            今天练什么
          </h2>
          <span className="muted">{activeUnit.title}</span>
        </div>
        <div className="home-goal-body">
          <div>
            <h3>
              {library.revisit
                ? getScenario(library.revisit.variantId).title
                : library.focus
                  ? targetTitle(library.focus)
                  : revisit
                    ? targetTitle(recommendation)
                    : course.title}
            </h3>
            <p>
              {library.revisit
                ? "继续尚未完成的变体练习，再开始下一项。"
                : library.focus
                  ? getScenario(library.focus.lessonId).objective
                  : revisit
                    ? getScenario(recommendation.lessonId).objective
                    : course.objective}
            </p>
            <span className="muted">
              {library.revisit
                ? `接着练 · ${getScenario(library.revisit.baseId).title}`
                : library.focus
                  ? `接着练 · ${getScenario(library.focus.lessonId).title}`
                  : revisit
                    ? "换一次尝试，保留上次成果"
                    : hasStarted(progress)
                      ? `接着上次：${stages[progress.stage]}`
                      : `第 ${scenarioCourses.indexOf(course) + 1} 课 · 听、说、读一起练`}
            </span>
          </div>
          <button
            type="button"
            className="home-primary"
            onClick={primaryAction}
          >
            {library.revisit
              ? "接着练变体"
              : library.focus
                ? "继续单项练习"
                : revisit
                  ? "开始单项练习"
                  : hasStarted(progress)
                    ? progress.stage === 5
                      ? "查看情景回顾"
                      : "继续情景课"
                    : "开始情景课"}
            <ArrowRight size={18} />
          </button>
        </div>
        {saveError && (
          <p className="scenario-notice" role="alert">
            情景课进度暂时无法保存，刷新后可能丢失。
          </p>
        )}
      </section>

      <section className="home-recent" aria-label="最近一次练习">
        <div className="home-section-heading">
          <h2>最近一次练习</h2>
          {latest && (
            <time className="muted" dateTime={latest.completedAt}>
              {formatAttemptDate(latest.completedAt)}
            </time>
          )}
        </div>
        {latest ? (
          <>
            <div className="home-recent-result">
              <div>
                <h3>
                  {getScenario(latest.lessonId).title}
                  {latest.kind === "focus" ? ` · ${targetTitle(latest)}` : ""}
                </h3>
                <p>{attemptSummary(latest)}</p>
              </div>
              <button
                type="button"
                className="home-link"
                onClick={() => onAttempt(library.attempts.length - 1)}
              >
                查看回顾
                <ArrowUpRight size={16} />
              </button>
            </div>
            <div className="home-next-practice">
              <div>
                <span className="muted">下一步，只练一件事</span>
                <p>
                  {library.revisit
                    ? getScenario(library.revisit.variantId).title
                    : targetTitle(recommendation)}
                </p>
                <span className="muted">
                  {
                    getScenario(
                      library.revisit?.baseId ?? recommendation.lessonId,
                    ).title
                  }
                </span>
              </div>
              <button
                type="button"
                className="home-link"
                onClick={() => onFocus(recommendation)}
              >
                {library.revisit
                  ? "继续变体练习"
                  : library.focus
                    ? "继续单项练习"
                    : recommendation.skill === "speaking"
                      ? "练这个回应"
                      : recommendation.skill === "listening"
                        ? "重练听力"
                        : "重练阅读"}
                <ArrowRight size={16} />
              </button>
            </div>
            <details className="home-history">
              <summary>练习记录 · {library.attempts.length} 次已保存</summary>
              <div>
                {library.attempts
                  .map((attempt, index) => ({ attempt, index }))
                  .reverse()
                  .map(({ attempt, index }) => (
                    <button
                      type="button"
                      key={index}
                      onClick={() => onAttempt(index)}
                    >
                      <span>
                        <strong>{getScenario(attempt.lessonId).title}</strong>
                        <small>
                          {attempt.kind === "focus"
                            ? targetTitle(attempt)
                            : attempt.kind === "revisit"
                              ? attempt.revisit?.mode === "delayed"
                                ? "隔日复测 · 材料 B"
                                : "变体练习 · 材料 B"
                              : "完整课程"}{" "}
                          · {formatAttemptDate(attempt.completedAt)}
                        </small>
                      </span>
                      <ChevronRight size={16} />
                    </button>
                  ))}
              </div>
            </details>
          </>
        ) : (
          <p className="home-empty">还没有完成的练习。从一个日常场景开始。</p>
        )}
      </section>

      <section className="home-scenario-catalogue" aria-label="情景课程">
        <div className="home-section-heading">
          <h2>情景课程</h2>
          <span className="muted">
            已完成 {completed} / {scenarioCourses.length} 课
          </span>
        </div>
        <div className="home-course-units">
          {courseUnits.map((unit) => (
            <details
              className="home-course-unit"
              key={unit.id}
              open={unit.id === activeUnit.id}
            >
              <summary>
                <span>
                  <strong>{unit.title}</strong>
                  <small>{unit.focus}</small>
                </span>
                <span className="home-unit-count">
                  {
                    unit.courses.filter(
                      (item) => library.courses[item.id].completedRuns > 0,
                    ).length
                  }{" "}
                  / {unit.courses.length} 课
                </span>
                <ChevronRight size={17} aria-hidden="true" />
              </summary>
              <div>
                {unit.courses.map((item) => {
                  const index = scenarioCourses.indexOf(item);
                  const record = library.courses[item.id];
                  return (
                    <button
                      type="button"
                      className="home-course-row"
                      key={item.id}
                      aria-label={`进入情景课：${item.title}`}
                      onClick={() => onCourse(item.id)}
                    >
                      <span className="home-course-order">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="home-course-description">
                        <strong>{item.title}</strong>
                        <span>{item.objective}</span>
                      </span>
                      <span className="home-course-status">
                        {record.completedAt ? (
                          <>
                            <Check size={14} />
                            完成 {record.completedRuns} 轮
                          </>
                        ) : hasStarted(record) ? (
                          stages[record.stage]
                        ) : (
                          "未开始"
                        )}
                      </span>
                      <ChevronRight size={17} />
                    </button>
                  );
                })}
              </div>
            </details>
          ))}
        </div>
      </section>

      <section className="home-foundation" aria-label="基础巩固">
        <div className="home-section-heading">
          <h2>基础巩固</h2>
          <span className="muted">词汇、语法与输入</span>
        </div>
        <div className="home-foundation-grid">
          <button
            type="button"
            aria-label="开始复习"
            onClick={foundation.onReview}
          >
            <RotateCcw size={20} />
            <span>
              <strong>词汇与句子复习</strong>
              <small aria-label={`${foundation.due} 项待复习`}>
                {foundation.due} 项待复习
              </small>
            </span>
            <ChevronRight size={16} />
          </button>
          <button
            type="button"
            aria-label="学习新课"
            onClick={foundation.onLessons}
          >
            <BookOpen size={20} />
            <span>
              <strong>基础课程</strong>
              <small>
                已完成 {foundation.completed} / {foundation.total} 课
              </small>
            </span>
            <ChevronRight size={16} />
          </button>
          <button
            type="button"
            aria-label="假名输入练习"
            onClick={foundation.onKana}
          >
            <Keyboard size={20} />
            <span>
              <strong>假名输入练习</strong>
              <small>
                {foundation.kanaAttempts
                  ? `累计练习 ${foundation.kanaAttempts} 次`
                  : "罗马音与假名"}
              </small>
            </span>
            <ChevronRight size={16} />
          </button>
          <button
            type="button"
            aria-label="听力练习"
            disabled={!foundation.canListen}
            onClick={foundation.onListen}
          >
            <Headphones size={20} />
            <span>
              <strong>听力专项</strong>
              <small>
                {foundation.canListen ? "听写与理解" : "需已学课程及浏览器语音"}
              </small>
            </span>
            <ChevronRight size={16} />
          </button>
        </div>
        {foundation.nextTitle && (
          <button
            type="button"
            className="home-link home-foundation-next"
            aria-label={`开始学习：${foundation.nextTitle}`}
            onClick={foundation.onNext}
          >
            下一门基础课程：{foundation.nextTitle}
            <ArrowRight size={16} />
          </button>
        )}
      </section>
    </div>
  );
}
