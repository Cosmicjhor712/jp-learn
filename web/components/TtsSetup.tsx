import { useEffect, useRef, useState } from "react";
import { Check, Play, Square, Trash2 } from "lucide-react";
import {
  defaultSelection,
  PROVIDERS,
  TTS_MODELS,
  type CloudProvider,
  type TtsProvider,
} from "../../shared/tts.ts";
import {
  getSessionApiKey,
  getTtsSelection,
  getWorkspaceId,
  hasSavedSelection,
  saveTtsSelection,
  setSessionApiKey,
  setWorkspaceId,
} from "../ttsSettings.ts";
import {
  isPlaybackCancelled,
  playLine,
  stopSpeaking,
  ttsStatus,
  type TtsStatus,
} from "../speech.ts";
import SpeechDialog from "./SpeechDialog.tsx";

export interface TtsSetupProps {
  onClose: () => void;
}
export default function TtsSetup({ onClose }: TtsSetupProps) {
  const [selection, setSelection] = useState(getTtsSelection);
  const [keys, setKeys] = useState({
    volc: getSessionApiKey("volc"),
    bailian: getSessionApiKey("bailian"),
  });
  const [workspace, setWorkspace] = useState(getWorkspaceId);
  const [showKey, setShowKey] = useState(false);
  const [status, setStatus] = useState<TtsStatus | null>(null);
  const [error, setError] = useState("");
  const [playing, setPlaying] = useState(false);
  const edited = useRef(false);
  const generation = useRef(0);
  const cloud = selection.provider === "browser" ? null : selection.provider;
  const models = TTS_MODELS.filter(
    (item) => item.provider === selection.provider,
  );
  const voices = models.find((item) => item.id === selection.model)!.voices;
  const configured = cloud
    ? !!keys[cloud].trim() || !!status?.providers?.[cloud]?.configured
    : true;
  const workspaceValid = !workspace || /^[a-zA-Z0-9-]{1,80}$/.test(workspace);
  const needsWorkspace =
    selection.model === "cosyvoice-v3-flash" &&
    !workspace &&
    !status?.workspaceConfigured;
  useEffect(() => {
    let alive = true;
    void ttsStatus().then((value) => {
      if (!alive) return;
      setStatus(value);
      if (!edited.current && !hasSavedSelection() && value?.defaultSelection)
        setSelection(value.defaultSelection);
    });
    return () => {
      alive = false;
      generation.current++;
      stopSpeaking();
    };
  }, []);
  function stop() {
    generation.current++;
    stopSpeaking();
    setPlaying(false);
  }
  function change(next: typeof selection) {
    edited.current = true;
    stop();
    setError("");
    setSelection(next);
  }
  function save() {
    if (cloud) setSessionApiKey(keys[cloud], cloud);
    setWorkspaceId(workspace);
    saveTtsSelection(selection);
    onClose();
  }
  async function preview() {
    stop();
    const current = generation.current;
    setPlaying(true);
    setError("");
    try {
      await playLine("こんにちは。よろしくお願いします。", false, {
        selection,
        apiKey: cloud ? keys[cloud] : "",
        workspaceId: workspace,
        ignorePreference: true,
      });
    } catch (reason) {
      if (generation.current === current && !isPlaybackCancelled(reason))
        setError(reason instanceof Error ? reason.message : "试听失败");
    } finally {
      if (generation.current === current) setPlaying(false);
    }
  }
  return (
    <SpeechDialog title="语音设置" onClose={onClose}>
      <div className="speech-form">
        <label>
          供应商
          <select
            value={selection.provider}
            onChange={(event) =>
              change(defaultSelection(event.target.value as TtsProvider))
            }
          >
            {PROVIDERS.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          模型
          <select
            value={selection.model}
            onChange={(event) =>
              change(defaultSelection(selection.provider, event.target.value))
            }
          >
            {models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          音色
          <select
            value={selection.voice}
            onChange={(event) =>
              change({ ...selection, voice: event.target.value })
            }
          >
            {voices.map((voice) => (
              <option key={voice.id} value={voice.id}>
                {voice.label}
              </option>
            ))}
          </select>
        </label>
        {cloud && (
          <>
            <label>
              API Key
              <input
                type={showKey ? "text" : "password"}
                autoComplete="off"
                spellCheck={false}
                value={keys[cloud]}
                placeholder={
                  status?.providers?.[cloud]?.configured
                    ? "服务端已配置，可留空"
                    : "仅保留在本标签页会话"
                }
                onChange={(event) =>
                  setKeys({ ...keys, [cloud]: event.target.value })
                }
              />
            </label>
            <div className="speech-inline">
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={showKey}
                  onChange={(event) => setShowKey(event.target.checked)}
                />
                显示 Key
              </label>
              <button
                type="button"
                disabled={!keys[cloud]}
                onClick={() => {
                  setSessionApiKey("", cloud as CloudProvider);
                  setKeys({ ...keys, [cloud]: "" });
                }}
              >
                <Trash2 size={15} />
                清除本会话 Key
              </button>
            </div>
            {cloud === "bailian" && (
              <label>
                北京业务空间 ID
                {selection.model === "qwen3-tts-flash" ? "（可选）" : ""}
                <input
                  value={workspace}
                  spellCheck={false}
                  autoComplete="off"
                  placeholder={
                    status?.workspaceConfigured
                      ? "服务端已配置，可留空"
                      : "llm-…"
                  }
                  onChange={(event) => setWorkspace(event.target.value.trim())}
                />
              </label>
            )}
            <p className="muted speech-status">
              {configured
                ? "已配置凭证，尚未验证当前模型权限。"
                : "未配置凭证，仅可播放已有录音。"}
            </p>
          </>
        )}
        {!workspaceValid && (
          <p role="alert" className="bad-text">
            请填写业务空间 ID，不是完整网址。
          </p>
        )}
        {needsWorkspace && (
          <p role="status" className="warn-text">
            CosyVoice 需要北京业务空间 ID。
          </p>
        )}
        <p className="speech-sample" lang="ja">
          こんにちは。よろしくお願いします。
        </p>
        {error && (
          <p role="alert" className="bad-text">
            {error}
          </p>
        )}
        <div className="speech-inline">
          {playing ? (
            <button type="button" onClick={stop}>
              <Square size={16} />
              停止试听
            </button>
          ) : (
            <button
              type="button"
              disabled={!configured || !workspaceValid || needsWorkspace}
              onClick={() => void preview()}
            >
              <Play size={16} />
              {cloud ? "试听样句（无缓存时计费）" : "试听样句"}
            </button>
          )}
          <button
            type="button"
            className="primary-btn"
            disabled={!workspaceValid}
            onClick={save}
          >
            <Check size={16} />
            保存配置
          </button>
        </div>
      </div>
    </SpeechDialog>
  );
}
