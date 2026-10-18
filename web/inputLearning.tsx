import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { KanaScript } from "../src/kana.ts";
import { fetchUserState, saveUserState } from "./userState.ts";

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
const PENDING_KEY = "jp-learn-input-pending";
const defaults: InputPreferences = {
  mode: "romaji",
  script: "hiragana",
  help: "after-error",
  keyboard: true,
};

interface InputLearningFile {
  version: 1;
  preferences: InputPreferences;
  history: KanaHistory;
}

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
function hasPending(): boolean {
  try {
    return localStorage.getItem(PENDING_KEY) === "1";
  } catch {
    return false;
  }
}
function markPending(): void {
  try {
    localStorage.setItem(PENDING_KEY, "1");
  } catch {
    /* 浏览器禁止存储时仍继续写文件 */
  }
}
function clearPending(): void {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {
    /* 浏览器禁止存储时仍继续写文件 */
  }
}

export function sanitizePreferences(value: unknown): InputPreferences {
  const partial = (
    value && typeof value === "object" ? value : {}
  ) as Partial<InputPreferences>;
  return {
    mode: partial.mode === "native" ? "native" : "romaji",
    script: partial.script === "katakana" ? "katakana" : "hiragana",
    help:
      partial.help === "always" || partial.help === "manual"
        ? partial.help
        : "after-error",
    keyboard:
      typeof partial.keyboard === "boolean"
        ? partial.keyboard
        : defaults.keyboard,
  };
}
export function sanitizeHistory(value: unknown): KanaHistory {
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
function readPreferences(): InputPreferences {
  return sanitizePreferences(readStorage(PREFS_KEY));
}
function readHistory(): KanaHistory {
  return sanitizeHistory(readStorage(HISTORY_KEY));
}
function hasInputData(state: {
  preferences: InputPreferences;
  history: KanaHistory;
}): boolean {
  return (
    Object.keys(state.history).length > 0 ||
    state.preferences.mode !== defaults.mode ||
    state.preferences.script !== defaults.script ||
    state.preferences.help !== defaults.help ||
    state.preferences.keyboard !== defaults.keyboard
  );
}
function isInputFile(
  value: unknown,
): value is { preferences?: unknown; history?: unknown } {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

let pendingSave: InputLearningFile | null = null;
let saving = false;

/** 合并连续修改，按顺序写入 user/input-learning.json。 */
function queueServerSave(data: InputLearningFile): void {
  pendingSave = data;
  if (saving) return;
  saving = true;
  void (async () => {
    try {
      while (pendingSave) {
        const next = pendingSave;
        pendingSave = null;
        if (await saveUserState("input-learning", next)) clearPending();
        else markPending();
      }
    } finally {
      saving = false;
    }
  })();
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
  const [ready, setReady] = useState(false);
  const dirty = useRef(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const remote = await fetchUserState("input-learning");
      const local = {
        preferences: readPreferences(),
        history: readHistory(),
      };
      const localHasData = hasInputData(local);
      const pending = hasPending() && localHasData;

      if (remote.status === "ok" && isInputFile(remote.data)) {
        const server = {
          preferences: sanitizePreferences(remote.data.preferences),
          history: sanitizeHistory(remote.data.history),
        };
        const useLocal = pending || (!hasInputData(server) && localHasData);
        const chosen = useLocal ? local : server;
        if (useLocal) {
          queueServerSave({ version: 1, ...local });
        } else {
          clearPending();
        }
        if (!alive) return;
        updatePreferences(chosen.preferences);
        updateHistory(chosen.history);
        persist(PREFS_KEY, chosen.preferences);
        persist(HISTORY_KEY, chosen.history);
      } else if (remote.status === "missing") {
        if (localHasData) {
          queueServerSave({ version: 1, ...local });
        } else {
          clearPending();
        }
      }
      if (alive) setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!ready || !dirty.current) return;
    queueServerSave({ version: 1, preferences, history });
  }, [preferences, history, ready]);

  function changeHistory(change: (history: KanaHistory) => KanaHistory): void {
    dirty.current = true;
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
          dirty.current = true;
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
