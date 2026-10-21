import { useEffect, useState } from "react";
import { Settings, X } from "lucide-react";

export default function SpeechNotice({
  onSettings,
}: {
  onSettings: () => void;
}) {
  const [message, setMessage] = useState("");
  useEffect(() => {
    const listener = (event: Event) =>
      setMessage((event as CustomEvent<{ message: string }>).detail.message);
    const clear = () => setMessage("");
    window.addEventListener("tts-playback-error", listener);
    window.addEventListener("tts-settings-changed", clear);
    return () => {
      window.removeEventListener("tts-playback-error", listener);
      window.removeEventListener("tts-settings-changed", clear);
    };
  }, []);
  if (!message) return null;
  return (
    <aside className="speech-notice" role="alert">
      <span>{message}</span>
      <button type="button" onClick={onSettings}>
        <Settings size={16} />
        语音设置
      </button>
      <button
        type="button"
        title="关闭提示"
        aria-label="关闭提示"
        onClick={() => setMessage("")}
      >
        <X size={16} />
      </button>
    </aside>
  );
}
