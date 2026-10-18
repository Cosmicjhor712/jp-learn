// ============================================================
// 情景课进度同步
//
// user/scenarios.json 是主记录；localStorage 是即时缓存和接口不可用时的回退。
// 首次打开新版本时，如果文件不存在而本地已有记录，会自动上传本地记录。
// ============================================================

import { fetchUserState, saveUserState } from "../userState.ts";
import { SCENARIO_STORAGE_KEY } from "./progress.ts";
import {
  LIBRARY_STORAGE_KEY,
  libraryHasProgress,
  loadLibrary,
  parseLibrary,
  pickSyncedLibrary,
  type LearningLibrary,
} from "./library.ts";

const PENDING_KEY = "jp-learn-scenarios-v2-pending";

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStorage(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
function hasPending(): boolean {
  return readStorage(PENDING_KEY) === "1";
}
function markPending(): void {
  writeStorage(PENDING_KEY, "1");
}
function clearPending(): void {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {
    /* 浏览器禁止存储时，仍继续尝试写入文件 */
  }
}
function isLibraryPayload(value: unknown): boolean {
  return (
    !!value &&
    typeof value === "object" &&
    (value as { version?: unknown }).version === 2 &&
    !!(value as { courses?: unknown }).courses &&
    typeof (value as { courses?: unknown }).courses === "object"
  );
}

let pendingSave: LearningLibrary | null = null;
let saving = false;

/** 合并连续修改，按顺序写入文件；失败时留下 pending 标记。 */
function queueServerSave(library: LearningLibrary): void {
  pendingSave = library;
  if (saving) return;
  saving = true;
  void (async () => {
    try {
      while (pendingSave) {
        const next = pendingSave;
        pendingSave = null;
        if (await saveUserState("scenarios", next)) clearPending();
        else markPending();
      }
    } finally {
      saving = false;
    }
  })();
}

/** 读取文件；文件不可用时回退 localStorage，并在需要时上传旧记录。 */
export async function loadSyncedLibrary(): Promise<LearningLibrary> {
  const local = loadLibrary();
  const pending = hasPending() && libraryHasProgress(local);
  const remote = await fetchUserState("scenarios");

  if (remote.status === "ok" && isLibraryPayload(remote.data)) {
    const parsed = parseLibrary(
      JSON.stringify(remote.data),
      readStorage(SCENARIO_STORAGE_KEY),
    );
    const chosen = pickSyncedLibrary(local, parsed, pending);
    if (chosen === local) {
      if (libraryHasProgress(local)) queueServerSave(local);
      else clearPending();
    } else {
      clearPending();
    }
    return chosen;
  }

  if (remote.status === "ok") {
    // 文件内容损坏时不覆盖它，但用本地记录修复下一次保存。
    if (libraryHasProgress(local)) queueServerSave(local);
    return local;
  }

  if (remote.status === "missing") {
    if (libraryHasProgress(local)) queueServerSave(local);
    else clearPending();
    return local;
  }

  // 接口不可用：继续用本地缓存，保留 pending 标记。
  return local;
}

/** 立即写 localStorage，并把最新快照排队写入文件。 */
export function saveSyncedLibrary(library: LearningLibrary): boolean {
  const stored = writeStorage(LIBRARY_STORAGE_KEY, JSON.stringify(library));
  queueServerSave(library);
  return stored;
}
