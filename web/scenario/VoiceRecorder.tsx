import { useEffect, useRef, useState } from "react";
import { Mic, Square, X } from "lucide-react";

export default function VoiceRecorder({
  beforeRecord,
  onActiveChange,
  speechPlaying,
}: {
  beforeRecord: () => void;
  onActiveChange: (active: boolean) => void;
  speechPlaying: boolean;
}) {
  const [status, setStatus] = useState<"idle" | "pending" | "recording">(
    "idle",
  );
  const [seconds, setSeconds] = useState(0);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const objectUrl = useRef("");
  const request = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const playback = useRef<HTMLAudioElement>(null);
  const supported =
    typeof MediaRecorder !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia;

  useEffect(() => {
    if (speechPlaying) playback.current?.pause();
  }, [speechPlaying]);

  function releaseStream() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  }
  function stop() {
    if (recorder.current?.state === "recording") recorder.current.stop();
    releaseStream();
  }
  useEffect(
    () => () => {
      // Permission may resolve after navigation. Invalidate that request before releasing devices.
      request.current += 1;
      stop();
      playback.current?.pause();
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      onActiveChange(false);
    },
    [onActiveChange],
  );

  async function start() {
    const current = ++request.current;
    beforeRecord();
    playback.current?.pause();
    setStatus("pending");
    onActiveChange(true);
    setError("");
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = "";
    setUrl("");
    try {
      const captured = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      if (request.current !== current) {
        captured.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = captured;
      const instance = new MediaRecorder(captured);
      recorder.current = instance;
      const chunks: Blob[] = [];
      let failed = false;
      instance.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      instance.onerror = () => {
        failed = true;
        if (request.current !== current) return;
        releaseStream();
        setError("录音失败，可以直接开口练习后自评。");
        setStatus("idle");
        onActiveChange(false);
      };
      instance.onstop = () => {
        if (request.current !== current) return;
        releaseStream();
        if (!failed && chunks.length) {
          objectUrl.current = URL.createObjectURL(
            new Blob(chunks, { type: instance.mimeType || chunks[0].type }),
          );
          setUrl(objectUrl.current);
        } else if (!failed) setError("没有录到声音，可以重新录音或直接自评。");
        setStatus("idle");
        onActiveChange(false);
      };
      instance.start();
      setStatus("recording");
      setSeconds(0);
      let elapsed = 0;
      timer.current = setInterval(() => {
        elapsed += 1;
        setSeconds(elapsed);
        if (elapsed >= 60) stop();
      }, 1000);
    } catch {
      if (request.current !== current) return;
      releaseStream();
      setStatus("idle");
      onActiveChange(false);
      setError("未能使用麦克风。仍可直接开口练习，不影响继续学习。");
    }
  }
  return (
    <div className="scenario-recorder">
      {supported ? (
        <div className="scenario-actions">
          {status === "idle" && (
            <button type="button" onClick={start}>
              <Mic size={17} />
              {url ? "重新录音" : "录下我的回答"}
            </button>
          )}
          {status === "pending" && (
            <button
              type="button"
              onClick={() => {
                request.current += 1;
                setStatus("idle");
                onActiveChange(false);
              }}
            >
              <X size={17} />
              取消等待麦克风
            </button>
          )}
          {status === "recording" && (
            <button type="button" className="recording-button" onClick={stop}>
              <Square size={16} />
              结束录音 · {seconds}s / 60s
            </button>
          )}
          <span className="muted">录音可选 · 仅本页回听，不上传或保存</span>
        </div>
      ) : (
        <p className="muted">当前环境不支持录音，可以直接开口练习。</p>
      )}
      {url && (
        <audio
          ref={playback}
          aria-label="我的回答录音"
          src={url}
          controls
          onPlay={beforeRecord}
        />
      )}
      {error && (
        <p className="scenario-notice" role="status">
          {error}
        </p>
      )}
    </div>
  );
}
