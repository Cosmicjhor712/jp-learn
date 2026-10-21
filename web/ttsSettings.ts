import {
  defaultSelection,
  isTtsSelection,
  type CloudProvider,
  type TtsSelection,
} from "../shared/tts.ts";

const PREFERENCE = "jp-learn-tts-selection-v1";
const CONFIRMED = "jp-learn-tts-confirmed";
const SKIP = "jp-learn-tts-skip";
const VARIANTS = "jp-learn-tts-sentence-versions";
const WORKSPACE = "jp-learn-bailian-workspace";
const memory = new Map<string, string>();
const keyName = (provider: CloudProvider) =>
  provider === "volc" ? "jp-learn-volc-api-key" : "jp-learn-bailian-api-key";

function get(key: string, persistent = false): string | null {
  try {
    return (
      (persistent ? localStorage : sessionStorage).getItem(key) ??
      memory.get(key) ??
      null
    );
  } catch {
    return memory.get(key) ?? null;
  }
}
function set(key: string, value: string | null, persistent = false): void {
  if (value === null) memory.delete(key);
  else memory.set(key, value);
  try {
    const storage = persistent ? localStorage : sessionStorage;
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, value);
  } catch {
    /* Keep this tab usable when storage is blocked. */
  }
}
export function getSessionApiKey(provider: CloudProvider = "volc"): string {
  return get(keyName(provider)) ?? "";
}
export function setSessionApiKey(
  key: string,
  provider: CloudProvider = "volc",
): void {
  set(keyName(provider), key.trim() || null);
}
export function getWorkspaceId(): string {
  return get(WORKSPACE, true) ?? "";
}
export function setWorkspaceId(id: string): void {
  set(WORKSPACE, id.trim(), true);
}
export function isTtsSkipped(): boolean {
  return get(SKIP) === "1";
}
export function setTtsSkipped(skipped: boolean): void {
  set(SKIP, skipped ? "1" : null);
}
export function hasSavedSelection(): boolean {
  try {
    return isTtsSelection(JSON.parse(get(PREFERENCE, true) ?? "null"));
  } catch {
    return false;
  }
}
export function getTtsSelection(): TtsSelection {
  if (isTtsSkipped()) return defaultSelection();
  try {
    const value: unknown = JSON.parse(get(PREFERENCE, true) ?? "null");
    if (isTtsSelection(value)) return value;
  } catch {
    /* Ignore invalid preferences. */
  }
  return defaultSelection(getSessionApiKey() ? "volc" : "browser");
}
export function saveTtsSelection(selection: TtsSelection): void {
  if (!isTtsSelection(selection)) return;
  set(PREFERENCE, JSON.stringify(selection), true);
  setTtsSkipped(selection.provider === "browser");
  set(CONFIRMED, "1");
  window.dispatchEvent(new Event("tts-settings-changed"));
}
export function hasConfirmedTts(): boolean {
  return get(CONFIRMED) === "1" || isTtsSkipped() || !!getSessionApiKey();
}
export function clearTtsSession(): void {
  setSessionApiKey("", "volc");
  setSessionApiKey("", "bailian");
  set(CONFIRMED, null);
  set(SKIP, null);
}
function sentenceVersions(): Record<string, string> {
  try {
    const value = JSON.parse(get(VARIANTS) ?? "{}");
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
  } catch {
    return {};
  }
}
export function getSentenceVersion(text: string): string | undefined {
  const id = sentenceVersions()[text.trim()];
  return typeof id === "string" ? id : undefined;
}
export function setSentenceVersion(text: string, id?: string): void {
  const versions = sentenceVersions();
  if (id) versions[text.trim()] = id;
  else delete versions[text.trim()];
  set(
    VARIANTS,
    JSON.stringify(Object.fromEntries(Object.entries(versions).slice(-500))),
  );
  window.dispatchEvent(new Event("tts-settings-changed"));
}
