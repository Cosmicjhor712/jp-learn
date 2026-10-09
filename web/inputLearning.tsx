import React, { createContext, useContext, useState } from "react";
import type { KanaScript } from "../src/kana.ts";

export type HelpMode = "always" | "after-error" | "manual";
export interface InputPreferences {
  mode: "romaji" | "native";
  script: KanaScript;
  help: HelpMode;
  keyboard: boolean;
}
export interface KanaRecord {
  kana: string;
  errors: number;
  attempts: number;
  successes: number;
  assisted: number;
}
export type KanaHistory = Record<string, KanaRecord>;
const PREFS_KEY = "jp-learn-input-preferences-v1";
const HISTORY_KEY = "jp-learn-kana-history-v1";
const defaults: InputPreferences = {
  mode: "romaji",
  script: "hiragana",
  help: "after-error",
  keyboard: true,
};

function readStorage(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null");
  } catch {
    return null;
  }
}
function persist(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Private browsing may disallow storage. */
  }
}
function readPreferences(): InputPreferences {
  const value = readStorage(PREFS_KEY) as Partial<InputPreferences> | null;
  return {
    mode: value?.mode === "native" ? "native" : "romaji",
    script: value?.script === "katakana" ? "katakana" : "hiragana",
    help:
      value?.help === "always" || value?.help === "manual"
        ? value.help
        : "after-error",
    keyboard:
      typeof value?.keyboard === "boolean" ? value.keyboard : defaults.keyboard,
  };
}
function readHistory(): KanaHistory {
  const value = readStorage(HISTORY_KEY);
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(([, record]) => {
      const item = record as KanaRecord;
      return (
        item &&
        typeof item.kana === "string" &&
        [item.errors, item.attempts, item.successes, item.assisted].every(
          (n) => Number.isFinite(n) && n >= 0,
        )
      );
    }),
  );
}
interface InputLearningState {
  preferences: InputPreferences;
  history: KanaHistory;
  setPreferences: (patch: Partial<InputPreferences>) => void;
  recordErrors: (kana: string[]) => void;
  recordPractice: (kana: string, correct: boolean, assisted: boolean) => void;
}
const Context = createContext<InputLearningState | null>(null);

export function InputLearningProvider({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const [preferences, updatePreferences] = useState(readPreferences);
  const [history, updateHistory] = useState(readHistory);
  function changeHistory(change: (history: KanaHistory) => KanaHistory): void {
    updateHistory((previous) => {
      const next = change(previous);
      persist(HISTORY_KEY, next);
      return next;
    });
  }
  return (
    <Context.Provider
      value={{
        preferences,
        history,
        setPreferences(patch) {
          updatePreferences((previous) => {
            const next = { ...previous, ...patch };
            persist(PREFS_KEY, next);
            return next;
          });
        },
        recordErrors(kana) {
          changeHistory((previous) => {
            const next = { ...previous };
            for (const text of new Set(kana)) {
              const item = next[text] ?? {
                kana: text,
                errors: 0,
                attempts: 0,
                successes: 0,
                assisted: 0,
              };
              next[text] = { ...item, errors: item.errors + 1 };
            }
            return next;
          });
        },
        recordPractice(kana, correct, assisted) {
          changeHistory((previous) => {
            const item = previous[kana] ?? {
              kana,
              errors: 0,
              attempts: 0,
              successes: 0,
              assisted: 0,
            };
            return {
              ...previous,
              [kana]: {
                ...item,
                attempts: item.attempts + 1,
                errors: item.errors + Number(!correct),
                successes: item.successes + Number(correct && !assisted),
                assisted: item.assisted + Number(assisted),
              },
            };
          });
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}

export function useInputLearning(): InputLearningState {
  const value = useContext(Context);
  if (!value) throw new Error("InputLearningProvider is required");
  return value;
}
