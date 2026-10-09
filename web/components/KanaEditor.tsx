import React, {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Keyboard, Languages, Trash2 } from "lucide-react";
import {
  convertInput,
  finalizeInput,
  inputCandidates,
  pendingRomaji,
} from "../../src/kana.ts";
import { useInputLearning, type HelpMode } from "../inputLearning.tsx";
import VirtualKeyboard from "./VirtualKeyboard.tsx";

export interface KanaEditorHandle {
  insert: (text: string) => void;
  focus: () => void;
}
export interface KanaEditorProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  onPending?: (prefix: string) => void;
  sequence?: string;
  showHelpSettings?: boolean;
}

const KanaEditor = forwardRef<KanaEditorHandle, KanaEditorProps>(
  function KanaEditor(
    { value, onChange, onSubmit, onPending, sequence, showHelpSettings = true },
    ref,
  ) {
    const { preferences, setPreferences } = useInputLearning();
    const input = useRef<HTMLInputElement>(null);
    const composing = useRef(false);
    const [caret, setCaret] = useState(value.length);
    const [error, setError] = useState("");
    const [pressed, setPressed] = useState("");
    const prefix =
      preferences.mode === "romaji" ? pendingRomaji(value.slice(0, caret)) : "";
    const candidates = inputCandidates(prefix, preferences.script);

    function restoreCaret(position: number): void {
      setCaret(position);
      requestAnimationFrame(() => {
        input.current?.focus();
        input.current?.setSelectionRange(position, position);
      });
    }
    function change(
      raw: string,
      position: number,
      convert = preferences.mode === "romaji",
    ): void {
      const next = convert ? convertInput(raw, preferences.script) : raw;
      const nextCaret = convert
        ? convertInput(raw.slice(0, position), preferences.script).length
        : position;
      onChange(next);
      setError("");
      onPending?.(convert ? pendingRomaji(next.slice(0, nextCaret)) : "");
      restoreCaret(nextCaret);
    }
    function insert(text: string): void {
      const start = input.current?.selectionStart ?? value.length;
      const end = input.current?.selectionEnd ?? start;
      change(
        value.slice(0, start) + text + value.slice(end),
        start + text.length,
      );
    }
    useImperativeHandle(ref, () => ({
      insert,
      focus: () => input.current?.focus(),
    }));
    function submit(): void {
      if (composing.current) return;
      const next =
        preferences.mode === "romaji"
          ? finalizeInput(value, preferences.script)
          : value;
      if (!next.trim()) return;
      if (/[a-z]/i.test(next) && next.toLowerCase().trim() !== "skip") {
        setError("还有未完成的罗马字，请补全后提交。");
        input.current?.focus();
        return;
      }
      onChange(next);
      setError("");
      onSubmit(next);
    }
    function keyboardKey(key: string): void {
      if (key === "Enter") {
        submit();
        return;
      }
      if (key === "Backspace") {
        const end = input.current?.selectionEnd ?? value.length;
        const selected = input.current?.selectionStart ?? end;
        const start = selected === end ? Math.max(0, end - 1) : selected;
        change(value.slice(0, start) + value.slice(end), start);
      } else insert(key);
    }

    return (
      <div className="kana-editor">
        <div className="input-toolbar">
          <div className="segmented" aria-label="输入方式">
            <button
              type="button"
              aria-pressed={preferences.mode === "romaji"}
              onClick={() => setPreferences({ mode: "romaji" })}
            >
              <Keyboard size={15} />
              罗马字
            </button>
            <button
              type="button"
              aria-pressed={preferences.mode === "native"}
              onClick={() => setPreferences({ mode: "native" })}
            >
              <Languages size={15} />
              系统输入法
            </button>
          </div>
          {preferences.mode === "romaji" ? (
            <div className="segmented script-switch" aria-label="假名类型">
              <button
                type="button"
                aria-label="平假名"
                aria-pressed={preferences.script === "hiragana"}
                onClick={() => {
                  setPreferences({ script: "hiragana" });
                  input.current?.focus();
                }}
              >
                あ
              </button>
              <button
                type="button"
                aria-label="片假名"
                aria-pressed={preferences.script === "katakana"}
                onClick={() => {
                  setPreferences({ script: "katakana" });
                  input.current?.focus();
                }}
              >
                ア
              </button>
            </div>
          ) : null}
          <button
            className="icon-button"
            type="button"
            title="清空输入"
            aria-label="清空输入"
            onClick={() => {
              onChange("");
              onPending?.("");
              restoreCaret(0);
            }}
          >
            <Trash2 size={17} />
          </button>
        </div>
        <form
          className="answer-row"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <input
            ref={input}
            aria-label="日语答案"
            lang="ja"
            autoFocus
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            value={value}
            placeholder={
              preferences.mode === "romaji" ? "输入罗马字" : "输入日语"
            }
            onCompositionStart={() => {
              composing.current = true;
            }}
            onCompositionEnd={(event) => {
              composing.current = false;
              change(
                event.currentTarget.value,
                event.currentTarget.selectionStart ??
                  event.currentTarget.value.length,
                false,
              );
            }}
            onChange={(event) => {
              const native =
                composing.current ||
                (event.nativeEvent as InputEvent).isComposing;
              if (native) {
                onChange(event.currentTarget.value);
                return;
              }
              change(
                event.currentTarget.value,
                event.currentTarget.selectionStart ??
                  event.currentTarget.value.length,
              );
            }}
            onSelect={(event) => {
              const position =
                event.currentTarget.selectionStart ?? value.length;
              setCaret(position);
              onPending?.(
                preferences.mode === "romaji"
                  ? pendingRomaji(value.slice(0, position))
                  : "",
              );
            }}
            onKeyDown={(event) => {
              setPressed(event.key.toLowerCase());
              if (
                event.key === "Enter" &&
                (composing.current ||
                  event.nativeEvent.isComposing ||
                  event.nativeEvent.keyCode === 229)
              ) {
                event.preventDefault();
                event.stopPropagation();
              }
            }}
            onKeyUp={() => setPressed("")}
            onBlur={() => setPressed("")}
          />
          <button className="submit-button" type="submit">
            提交
          </button>
        </form>
        <div className="input-status" aria-live="polite">
          {error ? (
            <span className="bad">{error}</span>
          ) : prefix ? (
            <>
              <kbd>{prefix}</kbd>
              <span>待完成</span>
              <span className="candidate-preview">
                {candidates.map((item) => item.kana).join(" · ")}
              </span>
            </>
          ) : (
            <span className="muted">
              {preferences.mode === "romaji"
                ? preferences.script === "katakana"
                  ? "片假名"
                  : "平假名"
                : "系统输入法"}
            </span>
          )}
        </div>
        <div className="input-options">
          {showHelpSettings ? (
            <label>
              按键标注
              <select
                aria-label="按键标注"
                value={preferences.help}
                onChange={(event) =>
                  setPreferences({ help: event.target.value as HelpMode })
                }
              >
                <option value="after-error">答错后显示</option>
                <option value="always">始终显示</option>
                <option value="manual">手动查看</option>
              </select>
            </label>
          ) : null}
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={preferences.keyboard}
              onChange={(event) =>
                setPreferences({ keyboard: event.target.checked })
              }
            />
            键盘
          </label>
        </div>
        {preferences.keyboard && preferences.mode === "romaji" ? (
          <VirtualKeyboard
            sequence={sequence ?? candidates[0]?.keys}
            pending={prefix}
            pressed={pressed}
            onKey={keyboardKey}
          />
        ) : null}
      </div>
    );
  },
);
export default KanaEditor;
