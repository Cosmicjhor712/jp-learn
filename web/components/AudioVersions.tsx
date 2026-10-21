import { useEffect, useRef, useState } from "react";
import {
  Check,
  ListMusic,
  Play,
  Plus,
  RotateCcw,
  Settings,
  Square,
} from "lucide-react";
import { selectionLabel, type AudioVariant } from "../../shared/tts.ts";
import {
  isPlaybackCancelled,
  listVariants,
  playLine,
  stopSpeaking,
} from "../speech.ts";
import {
  getSentenceVersion,
  getTtsSelection,
  setSentenceVersion,
} from "../ttsSettings.ts";
import SpeechDialog from "./SpeechDialog.tsx";
import TtsSetup from "./TtsSetup.tsx";

function VersionPicker({
  texts,
  onClose,
}: {
  texts: string[];
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [variants, setVariants] = useState<AudioVariant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [playing, setPlaying] = useState<string | null>(null);
  const [selected, setSelected] = useState(getSentenceVersion(texts[0]));
  const [slow, setSlow] = useState(false);
  const [revision, setRevision] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const generation = useRef(0);
  const text = texts[index];
  const selection = getTtsSelection();
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setVariants([]);
    setError("");
    setSelected(getSentenceVersion(text));
    void listVariants(text, controller.signal)
      .then((items) => {
        if (!controller.signal.aborted) setVariants(items);
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error ? reason.message : "录音列表读取失败",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [text, revision]);
  useEffect(
    () => () => {
      generation.current++;
      stopSpeaking();
    },
    [],
  );
  function stop() {
    generation.current++;
    stopSpeaking();
    setPlaying(null);
  }
  function choose(id?: string) {
    setSentenceVersion(text, id);
    setSelected(id);
  }
  async function play(id?: string) {
    if (
      !id &&
      !window.confirm(
        "为这句话使用当前配置生成录音？没有缓存时会调用云端服务并可能计费。",
      )
    )
      return;
    stop();
    const current = generation.current;
    setPlaying(id ?? "new");
    setError("");
    let completed = false;
    try {
      await playLine(text, slow, {
        variantId: id,
        selection,
        ignorePreference: true,
      });
      completed = true;
    } catch (reason) {
      if (generation.current === current && !isPlaybackCancelled(reason))
        setError(reason instanceof Error ? reason.message : "试听失败");
    } finally {
      if (generation.current === current) {
        setPlaying(null);
        if (!id && completed) setRevision((value) => value + 1);
      }
    }
  }
  return (
    <SpeechDialog title="录音版本" onClose={onClose}>
      {texts.length > 1 && (
        <label className="speech-select">
          发言
          <select
            aria-label="发言"
            value={index}
            onChange={(event) => {
              stop();
              setIndex(Number(event.target.value));
            }}
          >
            {texts.map((_, i) => (
              <option key={i} value={i}>
                第 {i + 1} 段发言
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="speech-inline speech-toolbar">
        <span className="muted" role="status">
          {loading ? "读取已有录音…" : `${variants.length} 个已缓存版本`}
        </span>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={slow}
            onChange={(event) => setSlow(event.target.checked)}
          />
          慢速试听
        </label>
        <button
          type="button"
          title="刷新录音列表"
          aria-label="刷新录音列表"
          onClick={() => setRevision((value) => value + 1)}
        >
          <RotateCcw size={16} />
        </button>
      </div>
      {error && (
        <p role="alert" className="bad-text">
          {error}
        </p>
      )}
      {!loading && !variants.length && !error && (
        <p className="muted">这句话还没有已缓存的录音。</p>
      )}
      <ul className="audio-version-list">
        {variants.map((variant) => (
          <li key={variant.id}>
            <div className="audio-version-details">
              <strong>{selectionLabel(variant)}</strong>
              <span className="muted">
                {variant.legacy
                  ? "旧版缓存 · 合成参数未完整记录"
                  : `${variant.format.toUpperCase()} · ${variant.sampleRate / 1000} kHz · ${new Date(variant.generatedAt).toLocaleDateString()}`}
              </span>
            </div>
            <div className="speech-inline">
              <button
                type="button"
                onClick={() =>
                  playing === variant.id ? stop() : void play(variant.id)
                }
              >
                {playing === variant.id ? (
                  <Square size={16} />
                ) : (
                  <Play size={16} />
                )}
                {playing === variant.id ? "停止" : "试听"}
              </button>
              <button
                type="button"
                aria-pressed={selected === variant.id}
                onClick={() => choose(variant.id)}
              >
                <Check size={16} />
                {selected === variant.id ? "本句已选" : "本句使用"}
              </button>
            </div>
          </li>
        ))}
      </ul>
      {selected && (
        <button type="button" onClick={() => choose()}>
          <RotateCcw size={15} />
          本句恢复默认配置
        </button>
      )}
      <footer className="speech-version-footer">
        <span className="muted">当前配置：{selectionLabel(selection)}</span>
        <button
          type="button"
          onClick={() => {
            stop();
            setSettingsOpen(true);
          }}
        >
          <Settings size={16} />
          语音设置
        </button>
        {selection.provider !== "browser" && (
          <button
            type="button"
            disabled={playing === "new" || loading}
            onClick={() => void play()}
          >
            <Plus size={16} />
            {playing === "new" ? "生成并播放中…" : "生成当前配置版本"}
          </button>
        )}
        {playing === "new" && (
          <button type="button" onClick={stop}>
            <Square size={16} />
            停止播放
          </button>
        )}
      </footer>
      {settingsOpen && <TtsSetup onClose={() => setSettingsOpen(false)} />}
    </SpeechDialog>
  );
}

export default function AudioVersions({
  text,
  compact = false,
  disabled = false,
}: {
  text: string | string[];
  compact?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={compact ? "scenario-icon" : undefined}
        title="选择已有录音版本"
        aria-label="录音版本"
        disabled={disabled}
        onClick={() => {
          stopSpeaking();
          setOpen(true);
        }}
      >
        <ListMusic size={17} />
        {!compact && "录音版本"}
      </button>
      {open && (
        <VersionPicker
          texts={typeof text === "string" ? [text] : text}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
