import React, { useState } from "react";
import {
  ArrowLeft,
  Headphones,
  Keyboard,
  RotateCcw,
  Target,
  Volume2,
} from "lucide-react";
import { checkAnswer } from "../../src/exercises.ts";
import {
  inputChunks,
  kanaCatalogue,
  KANA_GROUPS,
  type KanaGroup,
} from "../../src/kana.ts";
import { shuffle } from "../../src/logic.ts";
import { useInputLearning } from "../inputLearning.tsx";
import { canSpeak, speak } from "../speech.ts";
import QuestionPanel from "./QuestionPanel.tsx";
import KanaAnnotation from "./KanaAnnotation.tsx";
import ProgressBar from "./ProgressBar.tsx";

type PracticeMode = "sight" | "listen" | "weak";
interface Session {
  queue: string[];
  index: number;
  correct: number;
  assisted: number;
  mode: PracticeMode;
}

export default function KanaPractice({
  onBack,
}: {
  onBack: () => void;
}): React.JSX.Element {
  const { preferences, setPreferences, history, recordPractice } =
    useInputLearning();
  const [mode, setMode] = useState<PracticeMode>("sight");
  const [group, setGroup] = useState<KanaGroup | "all">("all");
  const [session, setSession] = useState<Session | null>(null);
  const weak = Object.values(history)
    .filter((item) => item.errors + item.assisted > 0)
    .sort(
      (a, b) =>
        b.errors +
        b.assisted -
        b.successes -
        (a.errors + a.assisted - a.successes),
    )
    .slice(0, 24);
  const practiceAttempts = Object.values(history).reduce(
    (total, item) => total + item.attempts,
    0,
  );
  const practiceSuccesses = Object.values(history).reduce(
    (total, item) => total + item.successes,
    0,
  );
  const pool = kanaCatalogue(preferences.script)
    .filter((item) => group === "all" || item.group === group)
    .filter(
      (item) =>
        mode !== "listen" ||
        (!item.keys.startsWith("x") && !["-", "di", "du"].includes(item.keys)),
    );
  const canStart = mode === "weak" ? weak.length > 0 : pool.length > 0;

  function start(): void {
    const queue =
      mode === "weak"
        ? weak.slice(0, 12).map((item) => item.kana)
        : shuffle(pool)
            .slice(0, 12)
            .map((item) => item.kana);
    if (queue.length)
      setSession({ queue, index: 0, correct: 0, assisted: 0, mode });
  }
  if (session && session.index < session.queue.length) {
    const expected = session.queue[session.index];
    return (
      <>
        <div className="practice-heading">
          <button
            className="back-btn"
            type="button"
            onClick={() => setSession(null)}
          >
            <ArrowLeft size={16} />
            结束本轮
          </button>
          <span>假名输入练习</span>
        </div>
        <ProgressBar current={session.index} total={session.queue.length} />
        <QuestionPanel
          key={`${session.mode}-${session.index}-${expected}`}
          title={
            session.mode === "listen"
              ? "听音打字"
              : session.mode === "weak"
                ? "易错项复练"
                : "看假名打字"
          }
          progress={`${session.index + 1}/${session.queue.length}`}
          prompt={session.mode === "listen" ? "输入听到的假名" : expected}
          expected={expected}
          play={
            session.mode === "listen"
              ? (slow) => speak(expected, slow)
              : undefined
          }
          check={(value) => checkAnswer(value, expected)}
          recordMistakes={false}
          onNext={(grade) => {
            recordPractice(expected, grade >= 2, grade === 2);
            setSession({
              ...session,
              index: session.index + 1,
              correct: session.correct + Number(grade >= 3),
              assisted: session.assisted + Number(grade === 2),
            });
          }}
        />
      </>
    );
  }
  if (session)
    return (
      <section className="practice-complete">
        <div className="card-head">
          <strong>本轮完成</strong>
          <button type="button" className="back-btn" onClick={onBack}>
            <ArrowLeft size={16} />
            返回
          </button>
        </div>
        <div className="practice-results">
          <div>
            <b>{session.correct}</b>
            <span>独立完成</span>
          </div>
          <div>
            <b>{session.assisted}</b>
            <span>辅助完成</span>
          </div>
          <div>
            <b>{session.queue.length - session.correct - session.assisted}</b>
            <span>待练习</span>
          </div>
        </div>
        <div className="question-actions">
          <button className="submit-button" type="button" onClick={start}>
            <RotateCcw size={16} />
            再练一轮
          </button>
          <button type="button" onClick={() => setSession(null)}>
            调整练习
          </button>
        </div>
      </section>
    );

  return (
    <section className="practice-menu">
      <div className="card-head">
        <strong>假名输入练习</strong>
        <button className="back-btn" type="button" onClick={onBack}>
          <ArrowLeft size={16} />
          返回
        </button>
      </div>
      <div className="practice-modes" aria-label="练习方式">
        <button
          type="button"
          aria-pressed={mode === "sight"}
          onClick={() => setMode("sight")}
        >
          <Keyboard size={20} />
          <span>看假名打字</span>
        </button>
        <button
          type="button"
          aria-pressed={mode === "listen"}
          disabled={!canSpeak}
          onClick={() => setMode("listen")}
        >
          <Headphones size={20} />
          <span>听音打字</span>
        </button>
        <button
          type="button"
          aria-pressed={mode === "weak"}
          onClick={() => setMode("weak")}
        >
          <Target size={20} />
          <span>易错项复练</span>
        </button>
      </div>
      <div className="practice-options">
        <label>
          假名类型
          <select
            aria-label="练习假名类型"
            value={preferences.script}
            onChange={(event) =>
              setPreferences({
                script:
                  event.target.value === "katakana" ? "katakana" : "hiragana",
              })
            }
          >
            <option value="hiragana">平假名</option>
            <option value="katakana">片假名</option>
          </select>
        </label>
        {mode !== "weak" ? (
          <label>
            练习范围
            <select
              aria-label="练习范围"
              value={group}
              onChange={(event) =>
                setGroup(event.target.value as KanaGroup | "all")
              }
            >
              <option value="all">全部假名</option>
              {KANA_GROUPS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <button
          className="submit-button"
          type="button"
          disabled={!canStart}
          onClick={start}
        >
          开始练习
        </button>
      </div>
      {!canStart ? (
        <div className="empty-state">
          {mode === "weak"
            ? "还没有易错记录，先完成一轮假名练习。"
            : "这个分组没有可独立辨认的听音题，请选择其他分组。"}
        </div>
      ) : null}
      <div className="practice-summary">
        <span>
          累计练习 <b>{practiceAttempts}</b> 项
        </span>
        <span>
          独立答对 <b>{practiceSuccesses}</b> 项
        </span>
        <span>
          易错项 <b>{weak.length}</b> 项
        </span>
      </div>
      <div className="weak-items">
        <h2>输入薄弱项</h2>
        {weak.length ? (
          weak.slice(0, 12).map((item) => (
            <div className="weak-item" key={item.kana}>
              <KanaAnnotation text={item.kana} />
              <span className="muted">
                错误 {item.errors} · 辅助 {item.assisted}
              </span>
              <button
                className="icon-button"
                type="button"
                title="播放发音"
                aria-label={`播放 ${item.kana}`}
                disabled={!canSpeak}
                onClick={() => speak(item.kana)}
              >
                <Volume2 size={16} />
              </button>
            </div>
          ))
        ) : (
          <div className="muted">暂无记录</div>
        )}
      </div>
      <div className="rules-reference">
        <h2>输入规则</h2>
        {[
          "いっしょに",
          "きょう",
          "きんようび",
          "デパート",
          "パーティー",
          "を",
        ].map((text) => (
          <div key={text}>
            <KanaAnnotation text={text} />
            <span className="muted">
              {inputChunks(text)
                .map((chunk) => chunk.keys)
                .join("")}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
