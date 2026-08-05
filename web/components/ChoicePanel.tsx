import React, { useEffect, useState } from "react";

export interface ChoicePanelProps {
  title: string;
  progress: string;
  question: string;
  choices: string[];
  correctIndex: number;
  play: (slow: boolean) => void;
  onNext: (grade: number) => void; // 1=忘了 2=难 3=好 4=轻松
}

type Phase = "listen" | "choose" | "success" | "gave-up";

const MAX_WRONG = 2;

export default function ChoicePanel({
  title,
  progress,
  question,
  choices,
  correctIndex,
  play,
  onNext,
}: ChoicePanelProps): React.JSX.Element {
  const [phase, setPhase] = useState<Phase>("listen");
  const [wrong, setWrong] = useState<number[]>([]);
  const [attempts, setAttempts] = useState(0);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    play(false);
  }, []);

  function next(): void {
    const grade = phase === "success" ? (attempts > 0 ? 2 : 3) : 1;
    onNext(grade);
  }

  function replay(nextSlow: boolean): void {
    setSlow(nextSlow);
    play(nextSlow);
  }

  function pick(index: number): void {
    if (phase !== "choose") return;
    if (index === correctIndex) {
      setPhase("success");
      return;
    }
    const nextAttempts = attempts + 1;
    setAttempts(nextAttempts);
    if (!wrong.includes(index)) setWrong([...wrong, index]);
    if (nextAttempts >= MAX_WRONG) setPhase("gave-up");
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
      if (phase === "listen" || phase === "choose") {
        if (e.key.toLowerCase() === "p") play(slow);
        if (e.key.toLowerCase() === "s") replay(!slow);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const reveal = phase === "success" || phase === "gave-up";

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

      <div className="prompt">▶ {question}</div>

      {phase === "listen" ? (
        <div className="listen-bar">
          <span className="playing">
            ▶ 正在播放…{slow ? "（慢速）" : ""}
          </span>
          <button onClick={() => play(slow)}>重听 (p)</button>
          <button onClick={() => replay(!slow)}>慢速 (s)</button>
          <button onClick={() => setPhase("choose")}>开始作答 (Enter)</button>
        </div>
      ) : null}

      {phase !== "listen" ? (
        <div className="choices">
          {choices.map((choice, index) => {
            const isCorrect = index === correctIndex;
            const isWrong = wrong.includes(index);
            let className = "choice";
            if (reveal && isCorrect) className += " choice-ok";
            else if (isWrong) className += " choice-bad";
            return (
              <button
                key={index}
                className={className}
                disabled={reveal}
                onClick={() => pick(index)}
              >
                <span className="choice-mark">
                  {reveal && isCorrect
                    ? "●"
                    : isWrong
                      ? "✗"
                      : "○"}
                </span>
                {choice}
              </button>
            );
          })}
        </div>
      ) : null}

      {phase === "choose" ? (
        <div className="hint">
          点击选项作答（p 重听 · s 慢速 · Enter 开始作答）
        </div>
      ) : null}

      {phase === "success" ? (
        <div className="result-ok">
          <strong>正解！</strong>
          <span className="muted">按 Enter 或点击按钮进入下一题</span>
          <button onClick={next}>下一题</button>
        </div>
      ) : null}

      {phase === "gave-up" ? (
        <div className="result-bad">
          <strong>本题先记为错误。</strong>
          <div>
            正确答案：<b className="ok-text">{choices[correctIndex]}</b>
          </div>
          <span className="muted">按 Enter 或点击按钮进入下一题</span>
          <button onClick={next}>下一题</button>
        </div>
      ) : null}
    </div>
  );
}
