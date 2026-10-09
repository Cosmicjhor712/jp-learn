import React, { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, Flag, RotateCcw, Volume2 } from "lucide-react";
import {
  diffTokens,
  normalize,
  type CheckResult,
} from "../../src/exercises.ts";
import { missedChunks, rulesFor, type InputChunk } from "../../src/kana.ts";
import { useInputLearning } from "../inputLearning.tsx";
import { canSpeak, speak } from "../speech.ts";
import KanaEditor, { type KanaEditorHandle } from "./KanaEditor.tsx";
import KanaAnnotation from "./KanaAnnotation.tsx";
import InputAssistant from "./InputAssistant.tsx";

export interface QuestionPanelProps {
  title: string;
  progress: string;
  prompt: string;
  expected: string;
  hint?: string;
  check: (answer: string) => CheckResult;
  onNext: (grade: number) => void;
  play?: (slow: boolean) => void;
  recordMistakes?: boolean;
}
type Phase = "input" | "success" | "gave-up";
const MAX_ATTEMPTS = 3;

export default function QuestionPanel({
  title,
  progress,
  prompt,
  expected,
  hint,
  check,
  onNext,
  play,
  recordMistakes = true,
}: QuestionPanelProps): React.JSX.Element {
  const { preferences, recordErrors } = useInputLearning();
  const [answer, setAnswer] = useState("");
  const [lastAnswer, setLastAnswer] = useState("");
  const [lastResult, setLastResult] = useState<CheckResult | null>(null);
  const [phase, setPhase] = useState<Phase>("input");
  const [attempts, setAttempts] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [manualAnnotation, setManualAnnotation] = useState<boolean | null>(
    null,
  );
  const [assisted, setAssisted] = useState(preferences.help === "always");
  const [slow, setSlow] = useState(false);
  const [prefix, setPrefix] = useState("");
  const [inspected, setInspected] = useState<InputChunk | null>(null);
  const editor = useRef<KanaEditorHandle>(null);
  const advanced = useRef(false);
  const completion = useRef<HTMLDivElement>(null);
  const showAnswer =
    revealed ||
    preferences.help === "always" ||
    Boolean(lastResult && !lastResult.correct);
  const annotate = manualAnnotation ?? preferences.help !== "manual";

  useEffect(() => {
    play?.(false);
    return () => {
      if (play && canSpeak) window.speechSynthesis.cancel();
    };
  }, []);
  useEffect(() => {
    if (preferences.help === "always") setAssisted(true);
  }, [preferences.help]);
  useEffect(() => {
    if (phase !== "input") completion.current?.focus();
  }, [phase]);
  function next(): void {
    if (advanced.current) return;
    advanced.current = true;
    onNext(phase === "success" ? (attempts > 0 || assisted ? 2 : 3) : 1);
  }
  function submit(value: string): void {
    if (phase !== "input") return;
    const result = check(value);
    setLastAnswer(value);
    setLastResult(result);
    setPrefix("");
    if (value.trim().toLowerCase() === "skip") {
      setPhase("gave-up");
      setRevealed(true);
      return;
    }
    if (result.correct) {
      setPhase("success");
      return;
    }
    const diff = diffTokens(value, result.expected);
    const kinds = diff.expectedTokens
      .filter((token) => token.kind !== "insert")
      .map((token) => token.kind);
    if (recordMistakes)
      recordErrors(
        missedChunks(normalize(result.expected), kinds).map(
          (chunk) => chunk.text,
        ),
      );
    setAttempts(attempts + 1);
    setAssisted(true);
    if (attempts + 1 >= MAX_ATTEMPTS) setPhase("gave-up");
    else {
      setAnswer("");
      editor.current?.focus();
    }
  }
  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if (event.isComposing || event.keyCode === 229) return;
      const target = event.target as HTMLElement;
      if (target.closest("input, textarea, select, button")) return;
      if (phase !== "input" && event.key === "Enter") {
        event.preventDefault();
        next();
      }
      if (phase === "input" && play) {
        if (event.key.toLowerCase() === "p") play(slow);
        if (event.key.toLowerCase() === "s") {
          setSlow(!slow);
          play(!slow);
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const diff =
    lastResult &&
    !lastResult.correct &&
    lastAnswer.trim().toLowerCase() !== "skip"
      ? diffTokens(lastAnswer, lastResult.expected)
      : null;
  const kinds = diff?.expectedTokens
    .filter((token) => token.kind !== "insert")
    .map((token) => token.kind);
  const mistakes = kinds ? missedChunks(normalize(expected), kinds) : [];
  const rules = rulesFor(
    mistakes.length ? mistakes.map((chunk) => chunk.text).join("") : expected,
  );

  return (
    <div className="study-workspace">
      <section
        className={`question-surface ${phase === "success" ? "surface-ok" : phase === "gave-up" ? "surface-bad" : ""}`}
      >
        <div className="card-head">
          <strong>{title}</strong>
          <span className="muted">{progress}</span>
        </div>
        <div className="prompt">{prompt}</div>
        {hint ? <div className="hint">{hint}</div> : null}
        {play ? (
          <div className="listen-bar">
            <button type="button" onClick={() => play(slow)}>
              <Volume2 size={16} />
              重听
            </button>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={slow}
                onChange={(event) => {
                  setSlow(event.target.checked);
                  play(event.target.checked);
                }}
              />
              慢速
            </label>
          </div>
        ) : null}
        {phase === "input" ? (
          <>
            <KanaEditor
              ref={editor}
              value={answer}
              onChange={setAnswer}
              onSubmit={submit}
              onPending={setPrefix}
              sequence={inspected?.keys}
            />
            <div className="question-actions">
              <button
                type="button"
                onClick={() => {
                  setRevealed(!revealed);
                  setAssisted(true);
                }}
              >
                <Eye size={15} />
                {revealed ? "收起答案" : "查看答案"}
              </button>
              <button type="button" onClick={() => submit("skip")}>
                <Flag size={15} />
                跳过
              </button>
              <span className="muted">
                {attempts ? `${attempts}/${MAX_ATTEMPTS} 次尝试` : ""}
              </span>
            </div>
          </>
        ) : null}
        {showAnswer && phase !== "success" ? (
          <div className="answer-feedback">
            <div className="feedback-heading">
              <span>{diff ? "再检查一下" : "正确答案"}</span>
              <button
                type="button"
                className="icon-button"
                title={annotate ? "隐藏按键标注" : "显示按键标注"}
                aria-label="切换答案按键标注"
                onClick={() => setManualAnnotation(!annotate)}
              >
                {annotate ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <KanaAnnotation
              text={normalize(lastResult?.expected ?? expected)}
              kinds={kinds}
              annotate={annotate}
              onInspect={setInspected}
            />
            {diff ? (
              <div className="previous-answer">
                <span className="muted">你的答案</span>
                <span lang="ja">
                  {diff.userTokens.map((token, index) => (
                    <span key={index} className={`diff-${token.kind}`}>
                      {token.char}
                    </span>
                  ))}
                </span>
              </div>
            ) : null}
            <div className="feedback-rules">
              {rules.map((rule) => (
                <div key={rule.id}>
                  <strong>{rule.title}</strong>
                  <p>{rule.explanation}</p>
                </div>
              ))}
            </div>
            {canSpeak ? (
              <button
                type="button"
                onClick={() => speak(lastResult?.expected ?? expected, slow)}
              >
                <Volume2 size={15} />
                播放答案
              </button>
            ) : null}
          </div>
        ) : null}
        {phase !== "input" ? (
          <div
            className={`completion ${phase === "success" ? "result-ok" : "result-bad"}`}
            tabIndex={-1}
            ref={completion}
          >
            <strong>
              {phase === "success"
                ? assisted || attempts > 0
                  ? "答对了 · 辅助完成"
                  : "正解！"
                : "本题先记为忘记"}
            </strong>
            {phase === "success" ? (
              <KanaAnnotation
                text={expected}
                annotate={
                  preferences.help === "always" || manualAnnotation === true
                }
                onInspect={setInspected}
              />
            ) : null}
            <button type="button" className="submit-button" onClick={next}>
              下一题
            </button>
            {phase === "gave-up" ? (
              <button
                type="button"
                onClick={() => {
                  setAttempts(0);
                  setAnswer("");
                  setPhase("input");
                  setRevealed(true);
                  setAssisted(true);
                }}
              >
                <RotateCcw size={15} />
                再练一次
              </button>
            ) : null}
          </div>
        ) : null}
      </section>
      <InputAssistant
        prefix={prefix}
        inspected={inspected}
        onInspect={setInspected}
        onInsert={
          phase === "input" ? (kana) => editor.current?.insert(kana) : undefined
        }
      />
    </div>
  );
}
