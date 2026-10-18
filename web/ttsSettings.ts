// ============================================================
// 语音设置：API Key 只保存在当前浏览器标签页的 sessionStorage，
// 关闭标签页自动清除，不写入项目文件，也不进入 git。
// ============================================================

const KEY_STORAGE = "jp-learn-volc-api-key";
const SKIP_STORAGE = "jp-learn-tts-skip";

function safeGet(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string | null): void {
  try {
    if (value === null) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, value);
  } catch {
    // 隐私模式等场景下不可用时保持内存外无持久化
  }
}

export function getSessionApiKey(): string {
  if (typeof window === "undefined") return "";
  return safeGet(KEY_STORAGE) ?? "";
}

export function setSessionApiKey(key: string): void {
  const trimmed = key.trim();
  safeSet(KEY_STORAGE, trimmed || null);
}

export function isTtsSkipped(): boolean {
  if (typeof window === "undefined") return true;
  return safeGet(SKIP_STORAGE) === "1";
}

export function setTtsSkipped(skipped: boolean): void {
  safeSet(SKIP_STORAGE, skipped ? "1" : null);
}

/** 清除本会话的 Key 与跳过标记 */
export function clearTtsSession(): void {
  safeSet(KEY_STORAGE, null);
  safeSet(SKIP_STORAGE, null);
}
