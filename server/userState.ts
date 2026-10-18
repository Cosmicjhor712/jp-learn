// ============================================================
// user/ 学习进度文件存储
//
// 只允许写入下列白名单文件，避免通过接口路径写入任意位置。
// 写入使用同目录临时文件 + rename，读取方不会看到半截 JSON。
// ============================================================

import fs from "node:fs";
import path from "node:path";

export const USER_STATE_FILES = {
  scenarios: "scenarios.json",
  "input-learning": "input-learning.json",
} as const;

export type UserStateName = keyof typeof USER_STATE_FILES;

export function isUserStateName(value: string): value is UserStateName {
  return Object.prototype.hasOwnProperty.call(USER_STATE_FILES, value);
}

export function userStatePath(dir: string, name: UserStateName): string {
  return path.join(dir, USER_STATE_FILES[name]);
}

/** 读取原始 JSON；文件不存在时返回 null。 */
export function readUserState(
  dir: string,
  name: UserStateName,
): string | null {
  try {
    return fs.readFileSync(userStatePath(dir, name), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/** 原子写入并格式化 JSON，便于 git diff。 */
export function writeUserState(
  dir: string,
  name: UserStateName,
  value: unknown,
): void {
  fs.mkdirSync(dir, { recursive: true });
  const file = userStatePath(dir, name);
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  try {
    fs.renameSync(temp, file);
  } catch (error) {
    try {
      fs.unlinkSync(temp);
    } catch {
      /* 清理失败时保留原错误 */
    }
    throw error;
  }
}
