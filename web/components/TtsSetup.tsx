import React, { useState } from "react";
import {
  clearTtsSession,
  getSessionApiKey,
  setSessionApiKey,
  setTtsSkipped,
} from "../ttsSettings.ts";

export interface TtsSetupProps {
  onClose: () => void;
}

export default function TtsSetup({
  onClose,
}: TtsSetupProps): React.JSX.Element {
  const [key, setKey] = useState(getSessionApiKey());
  const [showKey, setShowKey] = useState(false);
  const savedKey = getSessionApiKey();

  function enable(): void {
    if (!key.trim()) return;
    setSessionApiKey(key);
    setTtsSkipped(false);
    onClose();
  }

  function skip(): void {
    clearTtsSession();
    setTtsSkipped(true);
    onClose();
  }

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tts-setup-title"
    >
      <div className="modal">
        <h2 id="tts-setup-title">语音设置</h2>
        <p className="muted">
          填入火山引擎 API Key 后，练习语音将使用豆包 TTS 2.0
          生成的自然日语。Key 只保存在当前标签页会话中，关闭页面后自动清除，不会写入项目文件或提交到仓库。
        </p>
        {savedKey ? (
          <p className="ok-text">当前会话已启用火山引擎语音。</p>
        ) : null}
        <label className="field-label" htmlFor="volc-api-key">
          API Key
        </label>
        <input
          id="volc-api-key"
          className="modal-input"
          type={showKey ? "text" : "password"}
          value={key}
          onChange={(event) => setKey(event.target.value)}
          placeholder="粘贴火山引擎 API Key"
          autoFocus
        />
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={showKey}
            onChange={(event) => setShowKey(event.target.checked)}
          />
          显示 Key
        </label>
        <div className="modal-actions">
          <button
            type="button"
            className="primary-btn"
            onClick={enable}
            disabled={!key.trim()}
          >
            启用火山引擎语音
          </button>
          <button type="button" onClick={skip}>
            跳过，使用浏览器语音
          </button>
        </div>
        {savedKey ? (
          <button
            type="button"
            className="back-btn"
            onClick={() => {
              clearTtsSession();
              setKey("");
              onClose();
            }}
          >
            清除本会话的 Key
          </button>
        ) : null}
        <p className="hint">
          跳过或未填写时不会调用火山引擎；浏览器自带日语语音仍可正常使用。
        </p>
      </div>
    </div>
  );
}
