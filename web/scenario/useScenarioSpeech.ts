import { useCallback, useEffect, useRef, useState } from "react";

export function useScenarioSpeech() {
  const [available, setAvailable] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const utterance = useRef<SpeechSynthesisUtterance | null>(null);
  const stop = useCallback(() => {
    generation.current += 1;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    utterance.current = null;
    setPlaying(false);
  }, []);
  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    const refresh = () =>
      setAvailable(
        synth.getVoices().some((v) => v.lang.toLowerCase().startsWith("ja")),
      );
    refresh();
    synth.addEventListener("voiceschanged", refresh);
    return () => {
      synth.removeEventListener("voiceschanged", refresh);
      stop();
    };
  }, [stop]);

  function play(lines: string[], slow = false, onComplete?: () => void) {
    stop();
    const voice =
      "speechSynthesis" in window
        ? window.speechSynthesis
            .getVoices()
            .find((v) => v.lang.toLowerCase().startsWith("ja"))
        : undefined;
    if (!voice) {
      setError("当前没有可用的日语语音，可以先看文字完成练习。");
      return;
    }
    const current = generation.current;
    setError("");
    setPlaying(true);
    function next(index: number) {
      if (generation.current !== current) return;
      if (index === lines.length) {
        setPlaying(false);
        utterance.current = null;
        onComplete?.();
        return;
      }
      const item = new SpeechSynthesisUtterance(lines[index]);
      item.voice = voice!;
      item.lang = "ja-JP";
      item.rate = slow ? 0.75 : 1;
      item.onend = () => next(index + 1);
      const fail = () => {
        if (generation.current !== current) return;
        setPlaying(false);
        setError("语音播放失败；可以重试，或展开日文继续练习。");
      };
      item.onerror = fail;
      utterance.current = item;
      try {
        window.speechSynthesis.speak(item);
      } catch {
        fail();
      }
    }
    next(0);
  }
  return { available, playing, error, play, stop };
}
