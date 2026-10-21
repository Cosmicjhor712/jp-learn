import type { AudioVariant, TtsSelection, TtsStatus } from "../shared/tts.ts";
import {
  getSessionApiKey,
  getSentenceVersion,
  getTtsSelection,
  getWorkspaceId,
} from "./ttsSettings.ts";
export type { TtsStatus } from "../shared/tts.ts";

let currentAbort: AbortController | null = null;
let cancelPlayback: (() => void) | null = null;
let playToken = 0;
export const canSpeak =
  typeof window !== "undefined" &&
  ("speechSynthesis" in window || typeof Audio !== "undefined");
export function hasJapaneseVoice(): boolean {
  return (
    typeof window !== "undefined" &&
    !!window.speechSynthesis
      ?.getVoices()
      .some((voice) => voice.lang.toLowerCase().startsWith("ja"))
  );
}
export async function ttsStatus(): Promise<TtsStatus | null> {
  try {
    const response = await fetch("/api/tts/status", {
      signal: AbortSignal.timeout(8_000),
    });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}
async function checkResponse(response: Response): Promise<Response> {
  if (!response.ok) {
    const result = await response.json().catch(() => null);
    throw new Error(
      result?.message ?? `语音服务不可用（HTTP ${response.status}）`,
    );
  }
  return response;
}
export async function listVariants(
  text: string,
  signal?: AbortSignal,
): Promise<AudioVariant[]> {
  const response = await checkResponse(
    await fetch(`/api/tts/variants?text=${encodeURIComponent(text.trim())}`, {
      signal,
    }),
  );
  const result = await response.json();
  if (!Array.isArray(result.variants)) throw new Error("录音列表响应无效");
  return result.variants;
}
export function stopSpeaking(): void {
  playToken++;
  currentAbort?.abort();
  currentAbort = null;
  cancelPlayback?.();
  cancelPlayback = null;
  window.speechSynthesis?.cancel();
}
export function isPlaybackCancelled(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
const cancelled = () => new DOMException("播放已停止", "AbortError");

function playViaBrowser(text: string, slow: boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!window.speechSynthesis) {
      reject(new Error("当前浏览器不支持语音合成"));
      return;
    }
    const voice = window.speechSynthesis
      .getVoices()
      .find((item) => item.lang.toLowerCase().startsWith("ja"));
    if (!voice) {
      reject(
        new Error("浏览器没有可用的日语音色，请选择已有录音或配置云端语音"),
      );
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ja-JP";
    utterance.voice = voice;
    utterance.rate = slow ? 0.7 : 1;
    const cancel = () => reject(cancelled());
    cancelPlayback = cancel;
    const finish = () => {
      if (cancelPlayback === cancel) cancelPlayback = null;
    };
    utterance.onend = () => {
      finish();
      resolve();
    };
    utterance.onerror = () => {
      finish();
      reject(new Error("浏览器语音播放失败"));
    };
    window.speechSynthesis.speak(utterance);
  });
}
function playBlob(blob: Blob, slow: boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.preservesPitch = true;
    audio.playbackRate = slow ? 0.8 : 1;
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audio.removeAttribute("src");
      URL.revokeObjectURL(url);
      if (cancelPlayback === cancel) cancelPlayback = null;
      if (error) reject(error);
      else resolve();
    };
    const cancel = () => finish(cancelled());
    cancelPlayback = cancel;
    audio.onended = () => finish();
    audio.onerror = () =>
      finish(new Error("录音播放失败，请重试或选择另一份录音"));
    void audio
      .play()
      .catch(() => finish(new Error("浏览器未能播放音频，请再次点击播放")));
  });
}
export interface PlayOptions {
  variantId?: string;
  selection?: TtsSelection;
  apiKey?: string;
  workspaceId?: string;
  ignorePreference?: boolean;
}
export async function playLine(
  text: string,
  slow = false,
  options: PlayOptions = {},
): Promise<void> {
  text = text.trim();
  if (!text) return;
  stopSpeaking();
  const token = playToken;
  const selection = options.selection ?? getTtsSelection();
  const variantId =
    options.variantId ??
    (options.ignorePreference ? undefined : getSentenceVersion(text));
  if (!variantId && selection.provider === "browser") {
    await playViaBrowser(text, slow);
    return;
  }
  const controller = new AbortController();
  currentAbort = controller;
  const timeout = setTimeout(() => controller.abort(), 100_000);
  let blob: Blob;
  try {
    let response: Response;
    if (variantId) {
      response = await fetch(
        `/api/tts/audio?${new URLSearchParams({ text, id: variantId })}`,
        { signal: controller.signal },
      );
    } else {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (selection.provider !== "browser") {
        const key = options.apiKey ?? getSessionApiKey(selection.provider);
        if (key)
          headers[
            selection.provider === "volc"
              ? "X-Volc-Api-Key"
              : "X-Bailian-Api-Key"
          ] = key;
      }
      const workspace = options.workspaceId ?? getWorkspaceId();
      if (selection.provider === "bailian" && workspace)
        headers["X-Bailian-Workspace-Id"] = workspace;
      response = await fetch("/api/tts", {
        method: "POST",
        headers,
        signal: controller.signal,
        body: JSON.stringify({ text, selection }),
      });
    }
    await checkResponse(response);
    blob = await response.blob();
    if (!variantId) window.dispatchEvent(new Event("tts-cache-updated"));
  } catch (error) {
    if (token !== playToken) throw cancelled();
    if (controller.signal.aborted)
      throw new Error("语音请求超时，已生成的录音可能稍后可在录音版本中找到");
    throw error;
  } finally {
    clearTimeout(timeout);
    if (currentAbort === controller) currentAbort = null;
  }
  if (token !== playToken) throw cancelled();
  await playBlob(blob, slow);
}
export function speak(text: string, slow = false): void {
  void playLine(text, slow).catch((error: unknown) => {
    if (!isPlaybackCancelled(error))
      window.dispatchEvent(
        new CustomEvent("tts-playback-error", {
          detail: {
            text,
            message: error instanceof Error ? error.message : "语音播放失败",
          },
        }),
      );
  });
}
