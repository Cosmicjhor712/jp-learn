// ============================================================
// Web 语音播放
//
// 优先使用服务端 /api/tts（火山引擎豆包 TTS 2.0，生成 mp3 并缓存），
// 未配置或请求失败时回退到浏览器 Web Speech API。
// ============================================================

import { getSessionApiKey, isTtsSkipped } from "./ttsSettings.ts";

let voices: SpeechSynthesisVoice[] = [];
let jpVoice: SpeechSynthesisVoice | null = null;
let currentAudio: HTMLAudioElement | null = null;
let currentObjectUrl: string | null = null;
let currentAbort: AbortController | null = null;
let playToken = 0;

export const canSpeak: boolean =
  typeof window !== "undefined" &&
  ("speechSynthesis" in window || typeof Audio !== "undefined");

function refreshVoices(): void {
  voices = window.speechSynthesis.getVoices();
  jpVoice =
    voices.find((v) => v.lang.toLowerCase().startsWith("ja")) ?? null;
}

if (typeof window !== "undefined" && "speechSynthesis" in window) {
  refreshVoices();
  window.speechSynthesis.onvoiceschanged = refreshVoices;
}

export function hasJapaneseVoice(): boolean {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return false;
  }
  refreshVoices();
  return jpVoice !== null;
}

export interface TtsStatus {
  configured: boolean;
  voice: string;
}

/** 查询服务端是否已配置火山引擎 TTS */
export async function ttsStatus(): Promise<TtsStatus | null> {
  try {
    const res = await fetch("/api/tts/status");
    if (!res.ok) return null;
    return (await res.json()) as TtsStatus;
  } catch {
    return null;
  }
}

/** 停止当前语音（火山引擎音频 / 浏览器语音 / 进行中的请求） */
export function stopSpeaking(): void {
  playToken += 1;
  currentAbort?.abort();
  currentAbort = null;
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = null;
  }
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

function playViaBrowser(text: string, slow: boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      reject(new Error("当前浏览器不支持语音合成"));
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ja-JP";
    if (jpVoice) utterance.voice = jpVoice;
    utterance.rate = slow ? 0.7 : 1.0;
    utterance.onend = () => resolve();
    utterance.onerror = () => reject(new Error("浏览器语音播放失败"));
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  });
}

async function playViaServer(
  text: string,
  slow: boolean,
  token: number
): Promise<void> {
  const controller = new AbortController();
  currentAbort = controller;
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const apiKey = getSessionApiKey();
    const res = await fetch(`/api/tts?text=${encodeURIComponent(text)}`, {
      signal: controller.signal,
      headers: apiKey ? { "X-Volc-Api-Key": apiKey } : undefined,
    });
    if (!res.ok) {
      throw new Error(`TTS 服务不可用（HTTP ${res.status}）`);
    }

    const blob = await res.blob();
    if (token !== playToken) throw new Error("已被新的播放请求取代");

    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.preservesPitch = true;
    audio.playbackRate = slow ? 0.8 : 1.0;
    currentAudio = audio;
    currentObjectUrl = url;

    await audio.play();
    await new Promise<void>((resolve, reject) => {
      audio.onended = () => resolve();
      audio.onpause = () => resolve();
      audio.onerror = () => reject(new Error("音频播放失败"));
    });
  } finally {
    clearTimeout(timeout);
    if (currentAbort === controller) currentAbort = null;
  }
}

/**
 * 播放一行日语，播放完成（或失败/被停止）后 resolve。
 * 火山引擎不可用时自动回退浏览器语音。
 */
export async function playLine(text: string, slow = false): Promise<void> {
  if (!text) return;
  stopSpeaking();
  const token = playToken;

  // 用户选择跳过火山引擎时，直接使用浏览器语音
  if (isTtsSkipped() && !getSessionApiKey()) {
    await playViaBrowser(text, slow);
    return;
  }

  try {
    await playViaServer(text, slow, token);
  } catch (error) {
    if (token !== playToken) return; // 已被新的播放或 stop 取代
    await playViaBrowser(text, slow);
  }
}

/** 播放一段日语文本（不等待播放结束） */
export function speak(text: string, slow = false): void {
  if (!text) return;
  void playLine(text, slow).catch(() => {
    // 火山引擎与浏览器语音都不可用时静默失败
  });
}
