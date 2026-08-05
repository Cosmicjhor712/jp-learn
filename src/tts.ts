// ============================================================
// 跨平台语音播放
//   macOS  : say（内置日语语音 Kyoko）
//   Windows: PowerShell + System.Speech（SAPI，日语语音需语言包）
//   Linux  : espeak-ng / espeak / spd-say（-v ja / -l ja）
// ============================================================

import { spawn, spawnSync, type ChildProcess } from "node:child_process";

const SILENT = process.env.JP_LEARN_SILENT === "1";

type Backend = "say" | "powershell" | "espeak-ng" | "espeak" | "spd-say";

function hasCommand(cmd: string): boolean {
  try {
    const probe = process.platform === "win32" ? "where" : "which";
    return spawnSync(probe, [cmd], { stdio: "ignore" }).status === 0;
  } catch {
    return false;
  }
}

/** 探测当前平台可用的语音引擎（模块加载时执行一次） */
function detectBackend(): Backend | null {
  if (process.platform === "darwin") {
    return hasCommand("say") ? "say" : null;
  }
  if (process.platform === "win32") {
    return hasCommand("powershell.exe") ? "powershell" : null;
  }
  if (process.platform === "linux") {
    if (hasCommand("espeak-ng")) return "espeak-ng";
    if (hasCommand("espeak")) return "espeak";
    if (hasCommand("spd-say")) return "spd-say";
  }
  return null;
}

export const ttsBackend: Backend | null = detectBackend();
export const canSpeak: boolean = ttsBackend !== null;

let currentSay: ChildProcess | null = null;

function spawnBackend(
  backend: Backend,
  text: string,
  slow: boolean
): ChildProcess | null {
  switch (backend) {
    case "say": {
      const rate = slow ? 110 : 160;
      return spawn(
        "say",
        ["-v", "Kyoko", "-r", String(rate), text],
        { stdio: "ignore" }
      );
    }

    case "powershell": {
      // SAPI：优先选日语语音，找不到就回退到默认语音
      const rate = slow ? -2 : 1;
      const script = [
        "Add-Type -AssemblyName System.Speech",
        "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer",
        "try { $s.SelectVoiceByHints([System.Globalization.CultureInfo]::GetCultureInfo('ja-JP')) } catch {}",
        `$s.Rate = ${rate}`,
        `$s.Speak('${text.replace(/'/g, "''")}')`,
      ].join("; ");
      // 用 -EncodedCommand 传脚本，避免引号/编码问题
      const encoded = Buffer.from(script, "utf16le").toString("base64");
      return spawn(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
        { stdio: "ignore", windowsHide: true }
      );
    }

    case "espeak-ng": {
      const speed = slow ? 120 : 160;
      return spawn("espeak-ng", ["-v", "ja", "-s", String(speed), text], {
        stdio: "ignore",
      });
    }

    case "espeak": {
      const speed = slow ? 120 : 160;
      return spawn("espeak", ["-v", "ja", "-s", String(speed), text], {
        stdio: "ignore",
      });
    }

    case "spd-say": {
      const rate = slow ? 30 : 50;
      return spawn("spd-say", ["-l", "ja", "-r", String(rate), text], {
        stdio: "ignore",
      });
    }
  }

  return null;
}

/**
 * 播放一段日语文本。
 * 设置环境变量 JP_LEARN_SILENT=1 可静默（用于无音频环境测试）。
 */
export function speak(text: string, slow = false): void {
  if (SILENT || !canSpeak || !text || !ttsBackend) return;

  // 停止上一次还没播完的语音，避免重叠
  if (currentSay) currentSay.kill();

  const child = spawnBackend(ttsBackend, text, slow);
  if (!child) return;
  currentSay = child;

  child.on("exit", () => {
    if (currentSay === child) currentSay = null;
  });
  child.on("error", () => {
    if (currentSay === child) currentSay = null;
  });
}
