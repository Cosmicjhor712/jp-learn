import React, { useEffect, useRef, useState } from "react";
import type { CheckResult } from "../../src/exercises.ts";
import { diffTokens } from "../../src/exercises.ts";

export interface QuestionPanelProps {
  title: string;
  progress: string;
  prompt: string;
  hint?: string;
  check: (answer: string) => CheckResult;
  onNext: (grade: number) => void; // 1=忘了 2=难 3=好 4=轻松
  play?: (slow: boolean) => void; // 提供时进入听力模式
}

type Phase = "listen" | "input" | "relisten" | "retry" | "success" | "gave-up";

const MAX_ATTEMPTS = 3;

export default function QuestionPanel({
  title,
  progress,
  prompt,
  hint,
  check,
  onNext,
  play,
}: QuestionPanelProps): React.JSX.Element {
  const [answer, setAnswer] = useState("");
  const [lastAnswer, setLastAnswer] = useState("");
  const [lastResult, setLastResult] = useState<CheckResult | null>(null);
  const [phase, setPhase] = useState<Phase>(play ? "listen" : "input");
  const [attempts, setAttempts] = useState(0);
  const [showDiff, setShowDiff] = useState(false);
  const [slow, setSlow] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 进入题目时自动播放一次（听力模式）
  useEffect(() => {
    if (play) {
      play(false);
      inputRef.current?.focus();
    }
  }, []);

  function next(): void {
    const grade = phase === "success" ? (attempts > 0 ? 2 : 3) : 1;
    onNext(grade);
  }

  function submit(value: string): void {
    const trimmed = value.trim();
    if (!trimmed) return;

    const result = check(value);
    setLastAnswer(value);
    setLastResult(result);
    setAnswer("");

    if (trimmed.toLowerCase() === "skip") {
      setShowDiff(false);
      setPhase("gave-up");
      return;
    }

    if (result.correct) {
      setShowDiff(false);
      setPhase("success");
      return;
    }

    const nextAttempts = attempts + 1;
    setAttempts(nextAttempts);
    setShowDiff(true);
    setPhase(
      nextAttempts >= MAX_ATTEMPTS ? "gave-up" : play ? "relisten" : "retry"
    );
  }

  function replay(nextSlow: boolean): void {
    setSlow(nextSlow);
    play?.(nextSlow);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (phase === "success" || phase === "gave-up") {
        if (e.key === "Enter") {
          e.preventDefault();
          next();
        }
        return;
      }
      if (play && (phase === "listen" || phase === "relisten")) {
        if (e.key.toLowerCase() === "p") play(slow);
        if (e.key.toLowerCase() === "s") replay(!slow);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const diff =
    showDiff && lastResult && !lastResult.correct
      ? diffTokens(lastAnswer, lastResult.expected)
      : null;

  return (
    <div
      className={`card ${
        phase === "success"
          ? "card-ok"
          : phase === "gave-up"
            ? "card-bad"
            : ""
      }`}
    >
      <div className="card-head">
        <strong>{title}</strong>
        <span className="muted">{progress}</span>
      </div>

      <div className="prompt">{prompt}</div>
      {hint ? <div className="hint">提示：{hint}</div> : null}

      {phase === "listen" && play ? (
        <div className="listen-bar">
          <span className="playing">
            ▶ 正在播放…{slow ? "（慢速）" : ""}
          </span>
          <button onClick={() => play(slow)}>重听 (p)</button>
          <button onClick={() => replay(!slow)}>慢速 (s)</button>
          <button
            onClick={() => {
              setPhase("input");
              inputRef.current?.focus();
            }}
          >
            开始作答 (Enter)
          </button>
        </div>
      ) : null}

      {phase === "input" || phase === "retry" ? (
        <form
          className="answer-row"
          onSubmit={(e) => {
            e.preventDefault();
            submit(answer);
          }}
        >
          <input
            ref={inputRef}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="输入日语答案，或输入 skip"
            autoFocus
          />
          <button type="submit">提交</button>
        </form>
      ) : null}

      {diff ? (
        <div className="diff-block">
          <div className="bad">
            不对{phase === "gave-up" ? "" : "，再试一次"}。
          </div>
          <div>
            <span className="muted">正确答案：</span>
            <span className="diff-line">
              {diff.expectedTokens.map((token, index) => (
                <span key={index} className={`diff-${token.kind}`}>
                  {token.char}
                </span>
              ))}
            </span>
          </div>
          <div>
            <span className="muted">你的答案：</span>
            <span className="diff-line">
              {diff.userTokens.map((token, index) => (
                <span key={index} className={`diff-${token.kind}`}>
                  {token.char}
                </span>
              ))}
            </span>
          </div>
          <div className="hint">绿色=正确 红色=漏掉 黄色=多打</div>
        </div>
      ) : null}

      {phase === "relisten" && play ? (
        <div className="listen-bar">
          <button onClick={() => play(slow)}>重听 (p)</button>
          <button onClick={() => replay(!slow)}>
            慢速{slow ? "（慢速）" : ""} (s)
          </button>
          <button
            onClick={() => {
              setPhase("input");
              inputRef.current?.focus();
            }}
          >
            再答一次 (Enter)
          </button>
        </div>
      ) : null}

      {phase === "success" ? (
        <div className="result-ok">
          <strong>正解！</strong>
          <span className="muted">按 Enter 或点击按钮进入下一题</span>
          <button onClick={next}>下一题</button>
        </div>
      ) : null}

      {phase === "gave-up" && lastResult ? (
        <div className="result-bad">
          <strong>本题先记为错误。</strong>
          <div>
            正确答案：<b className="ok-text">{lastResult.expected}</b>
          </div>
          <span className="muted">按 Enter 或点击按钮进入下一题</span>
          <button onClick={next}>下一题</button>
        </div>
      ) : null}
    </div>
  );
}
