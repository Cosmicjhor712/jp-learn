// ============================================================
// Web 语音播放（浏览器 Web Speech API，跨平台）
// ============================================================

let voices: SpeechSynthesisVoice[] = [];
let jpVoice: SpeechSynthesisVoice | null = null;

export const canSpeak: boolean =
  typeof window !== "undefined" && "speechSynthesis" in window;

function refreshVoices(): void {
  voices = window.speechSynthesis.getVoices();
  jpVoice =
    voices.find((v) => v.lang.toLowerCase().startsWith("ja")) ?? null;
}

if (canSpeak) {
  refreshVoices();
  window.speechSynthesis.onvoiceschanged = refreshVoices;
}

/** 播放一段日语文本；slow=true 时慢速 */
export function speak(text: string, slow = false): void {
  if (!canSpeak || !text) return;

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ja-JP";
  if (jpVoice) utterance.voice = jpVoice;
  utterance.rate = slow ? 0.7 : 1.0;
  window.speechSynthesis.speak(utterance);
}
