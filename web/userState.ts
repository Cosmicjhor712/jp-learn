// ============================================================
// user/ 学习进度文件读写
//
// 文件优先、localStorage 回退：
//   - GET /api/state/<name> 返回文件 JSON；文件不存在返回 null
//   - PUT /api/state/<name> 原子写入 user/<name>.json
//
// 静态部署没有这些接口时返回 unavailable，调用方继续用 localStorage。
// ============================================================

export type UserStateName = "scenarios" | "input-learning";

export type UserStateResult =
  | { status: "ok"; data: unknown }
  | { status: "missing" }
  | { status: "unavailable" };

const LOAD_TIMEOUT_MS = 3000;
const SAVE_TIMEOUT_MS = 8000;

export async function fetchUserState(
  name: UserStateName
): Promise<UserStateResult> {
  try {
    const response = await fetch(`/api/state/${name}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(LOAD_TIMEOUT_MS),
    });
    if (response.status === 404) return { status: "missing" };
    if (!response.ok) return { status: "unavailable" };
    const text = (await response.text()).trim();
    if (!text || text === "null") return { status: "missing" };
    return { status: "ok", data: JSON.parse(text) };
  } catch {
    return { status: "unavailable" };
  }
}

export async function saveUserState(
  name: UserStateName,
  data: unknown
): Promise<boolean> {
  try {
    const response = await fetch(`/api/state/${name}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(SAVE_TIMEOUT_MS),
    });
    return response.ok;
  } catch {
    return false;
  }
}
