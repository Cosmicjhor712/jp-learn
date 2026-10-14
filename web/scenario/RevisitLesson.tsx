import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { getScenario } from "./catalogue.ts";
import {
  Listening,
  Reading,
  Speaking,
  ScenarioReport,
} from "./ScenarioLesson.tsx";
import { useScenarioSpeech } from "./useScenarioSpeech.ts";
import {
  revisitPlans,
  revisitIndependent,
  revisitReady,
  revisitStages,
  revisitUnlockedStep,
  type RevisitRun,
} from "./revisit.ts";
import type { ScenarioProgress } from "./progress.ts";
import type { LearningLibrary, SavedAttempt } from "./library.ts";
import "./revisit.css";

export const formatRevisitTime = (value: string) =>
  new Date(value).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

export function RevisitOutcome({
  attempt,
  library,
}: {
  attempt: SavedAttempt;
  library: LearningLibrary;
}) {
  const metadata = attempt.revisit;
  if (!metadata) return null;
  const plan = revisitPlans(library).find(
    (item) => item.baseId === metadata.baseId,
  );
  const intervalHours = Math.floor(
    (Date.parse(metadata.startedAt) - Date.parse(metadata.anchorAt)) / 3600000,
  );
  return (
    <>
      <div className="revisit-result-context">
        <strong>
          {metadata.mode === "delayed"
            ? `间隔 ${intervalHours} 小时后的复测`
            : "变体练习 · 不计为到期复测"}
        </strong>
        <p>
          原场景：{getScenario(metadata.baseId).title} · 材料 B / v
          {metadata.contentVersion}
        </p>
        <p>
          {metadata.mode === "delayed"
            ? revisitIndependent(attempt.progress)
              ? "理解题无提示答对，表达项自评独立完成。"
              : "本次仍有错题、辅助使用或表达需要练习。"
            : "提前练习或中途温习过原材料，只记录本次表现。"}
        </p>
        {plan && (
          <p>
            当前复测安排：
            <time dateTime={plan.dueAt}>{formatRevisitTime(plan.dueAt)}</time>
            （间隔 {plan.intervalDays} 天）
          </p>
        )}
      </div>
      <ScenarioReport progress={attempt.progress} />
    </>
  );
}

export default function RevisitLesson({
  run,
  onChange,
  onStep,
  onFinish,
  saveError,
}: {
  run: RevisitRun;
  onChange: Dispatch<SetStateAction<ScenarioProgress>>;
  onStep: (step: number) => void;
  onFinish: () => void;
  saveError: boolean;
}) {
  const course = getScenario(run.variantId);
  const speech = useScenarioSpeech();
  const heading = useRef<HTMLHeadingElement>(null);
  const maxStep = Math.min(3, revisitUnlockedStep(run.progress));
  useEffect(() => {
    window.scrollTo(0, 0);
    heading.current?.focus({ preventScroll: true });
    return speech.stop;
  }, [run.step, speech.stop]);
  return (
    <div className="scenario-lesson revisit-lesson">
      <div className="scenario-course-heading">
        <span className="scenario-eyebrow">
          {run.mode === "delayed" ? "隔日再测" : "变体练习"} ·{" "}
          {getScenario(run.baseId).title}
        </span>
        <h1>{course.title}</h1>
        <p className="muted">
          材料 B / v{run.contentVersion} ·{" "}
          {run.mode === "delayed"
            ? `计划间隔 ${run.intervalDays} 天`
            : "普通变体练习，完成后重新安排间隔"}
        </p>
      </div>
      {saveError && (
        <p className="scenario-notice" role="alert">
          本次记录暂时无法保存，刷新可能丢失。
        </p>
      )}
      {!speech.available && (
        <p className="scenario-notice">
          未检测到日语语音，可以借助文字继续；本轮不计为独立听懂。
        </p>
      )}
      {speech.error && (
        <p className="scenario-notice" role="alert">
          {speech.error}
        </p>
      )}
      <nav className="scenario-steps revisit-steps" aria-label="复测环节">
        {revisitStages.map((label, step) => (
          <button
            type="button"
            key={label}
            aria-current={run.step === step ? "step" : undefined}
            disabled={step > maxStep}
            onClick={() => onStep(step)}
          >
            <span>{step + 1}</span>
            {label}
          </button>
        ))}
      </nav>
      <section className="scenario-stage" key={`${run.variantId}-${run.step}`}>
        <h2 ref={heading} tabIndex={-1}>
          {revisitStages[run.step]}
        </h2>
        {run.step === 0 && (
          <Listening
            progress={run.progress}
            onChange={onChange}
            speech={speech}
          />
        )}
        {run.step === 1 && (
          <Speaking
            prompts={course.responsePrompts}
            progress={run.progress}
            onChange={onChange}
            speech={speech}
          />
        )}
        {run.step === 2 && (
          <Speaking
            prompts={[course.transferPrompt]}
            progress={run.progress}
            onChange={onChange}
            speech={speech}
          />
        )}
        {run.step === 3 && (
          <Reading progress={run.progress} onChange={onChange} />
        )}
      </section>
      <footer className="scenario-footer">
        <button
          type="button"
          className="home-link"
          disabled={run.step === 0}
          onClick={() => onStep(run.step - 1)}
        >
          <ArrowLeft size={17} />
          上一环节
        </button>
        {run.step < 3 ? (
          <button
            type="button"
            className="home-primary"
            disabled={run.step >= maxStep}
            onClick={() => onStep(run.step + 1)}
          >
            下一环节
            <ArrowRight size={17} />
          </button>
        ) : (
          <button
            type="button"
            className="home-primary"
            disabled={!revisitReady(run.progress)}
            onClick={() => {
              speech.stop();
              onFinish();
            }}
          >
            完成变体练习
            <Check size={17} />
          </button>
        )}
      </footer>
    </div>
  );
}
