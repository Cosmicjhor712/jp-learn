import { useCallback, useEffect, useRef, useState } from "react";
import {
  hasJapaneseVoice,
  playLine,
  stopSpeaking,
  ttsStatus,
} from "../speech.ts";
import { getSessionApiKey, isTtsSkipped } from "../ttsSettings.ts";

export function useScenarioSpeech() {
  const [available, setAvailable] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);

  useEffect(() => {
    let alive = true;
    let removeVoiceListener: (() => void) | undefined;

    // 没有服务端 TTS 时，退回检查浏览器是否有日语语音
    function watchBrowserVoices(): void {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) {
        if (alive) setAvailable(false);
        return;
      }
      const synth = window.speechSynthesis;
      const refresh = () => {
        if (alive) setAvailable(hasJapaneseVoice());
      };
      refresh();
      synth.addEventListener("voiceschanged", refresh);
      removeVoiceListener = () =>
        synth.removeEventListener("voiceschanged", refresh);
    }

    ttsStatus().then((status) => {
      if (!alive) return;
      if (!isTtsSkipped() && (status?.configured || getSessionApiKey())) {
        setAvailable(true);
      } else {
        watchBrowserVoices();
      }
    });

    return () => {
      alive = false;
      removeVoiceListener?.();
      generation.current += 1;
      stopSpeaking();
    };
  }, []);

  const stop = useCallback(() => {
    generation.current += 1;
    stopSpeaking();
    setPlaying(false);
  }, []);

  function play(lines: string[], slow = false, onComplete?: () => void) {
    stop();
    const current = generation.current;
    setError("");
    setPlaying(true);

    void (async () => {
      for (const line of lines) {
        if (generation.current !== current) return;
        await playLine(line, slow);
      }
      if (generation.current !== current) return;
      setPlaying(false);
      onComplete?.();
    })().catch(() => {
      if (generation.current !== current) return;
      setPlaying(false);
      setError("语音播放失败；可以重试，或展开日文继续练习。");
    });
  }

  return { available, playing, error, play, stop };
}
