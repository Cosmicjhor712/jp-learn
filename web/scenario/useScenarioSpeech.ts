import { useCallback, useEffect, useRef, useState } from "react";
import {
  canSpeak,
  isPlaybackCancelled,
  playLine,
  stopSpeaking,
} from "../speech.ts";

export function useScenarioSpeech() {
  const available = canSpeak;
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);

  useEffect(() => {
    return () => {
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
    })().catch((reason: unknown) => {
      if (generation.current !== current) return;
      setPlaying(false);
      if (!isPlaybackCancelled(reason)) {
        setError(
          reason instanceof Error
            ? reason.message
            : "语音播放失败；可以重试，或展开日文继续练习。",
        );
      }
    });
  }

  return { available, playing, error, play, stop };
}
