// ============================================================
// 语音播放（macOS say）
// ============================================================

import { spawn, type ChildProcess } from "node:child_process";

const VOICE = "Kyoko"; // macOS 内置日语女声
const RATE_NORMAL = 160; // 正常语速（词/分钟）
const RATE_SLOW = 110; // 慢速

let currentSay: ChildProcess | null = null;

/** 当前环境是否支持 say 语音（macOS） */
export const canSpeak: boolean = process.platform === "darwin";

/**
 * 播放一段日语文本。
 * 设置环境变量 JP_LEARN_SILENT=1 可静默（用于无音频环境测试）。
 */
export function speak(text: string, slow = false): void {
  if (!canSpeak || !text) return;
  if (process.env.JP_LEARN_SILENT === "1") return;

  // 停止上一次还没播完的语音，避免重叠
  if (currentSay) {
    currentSay.kill();
  }

  const child = spawn(
    "say",
    ["-v", VOICE, "-r", String(slow ? RATE_SLOW : RATE_NORMAL), text],
    { stdio: "ignore" }
  );
  currentSay = child;

  child.on("exit", () => {
    if (currentSay === child) currentSay = null;
  });
  child.on("error", () => {
    if (currentSay === child) currentSay = null;
  });
}
