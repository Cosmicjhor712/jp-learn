import type { TtsSelection } from "../shared/tts.ts";

export interface BailianConfig {
  apiKey: string;
  workspaceId: string;
}
export function readBailianConfig(
  env: Record<string, string | undefined>,
): BailianConfig {
  return {
    apiKey: (env.DASHSCOPE_API_KEY ?? "").trim(),
    workspaceId: (env.DASHSCOPE_WORKSPACE_ID ?? "").trim(),
  };
}

export function bailianRequest(
  config: BailianConfig,
  selection: TtsSelection,
  text: string,
) {
  if (config.workspaceId && !/^[a-zA-Z0-9-]{1,80}$/.test(config.workspaceId))
    throw new Error("业务空间 ID 格式不正确");
  const qwen = selection.model === "qwen3-tts-flash";
  if (!qwen && selection.model !== "cosyvoice-v3-flash")
    throw new Error("不支持的百炼模型");
  if (!qwen && !config.workspaceId)
    throw new Error("CosyVoice 需要北京地域的业务空间 ID，请在语音设置中填写");
  const host = config.workspaceId
    ? `${config.workspaceId}.cn-beijing.maas.aliyuncs.com`
    : "dashscope.aliyuncs.com";
  return {
    url: `https://${host}/api/v1/services/${qwen ? "aigc/multimodal-generation/generation" : "audio/tts/SpeechSynthesizer"}`,
    body: {
      model: selection.model,
      input: qwen
        ? { text, voice: selection.voice, language_type: "Japanese" }
        : { text, voice: selection.voice, format: "wav", sample_rate: 24000 },
    },
  };
}

// Download only the documented Beijing result bucket, without the API credential.
export function safeAudioUrl(value: string): string {
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.hostname !== "dashscope-result-bj.oss-cn-beijing.aliyuncs.com" ||
    url.username ||
    url.password ||
    url.port
  )
    throw new Error("百炼返回了非预期的音频地址");
  url.protocol = "https:";
  return url.href;
}

async function limitedBody(response: Response, limit: number): Promise<Buffer> {
  if (!response.body) throw new Error("服务未返回数据");
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) {
        await reader.cancel();
        throw new Error("语音响应超过大小限制");
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}

export async function synthesizeBailian(
  config: BailianConfig,
  selection: TtsSelection,
  text: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Buffer> {
  const request = bailianRequest(config, selection, text);
  const response = await fetchImpl(request.url, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(60_000),
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request.body),
  });
  if (!response.ok)
    throw new Error(
      `百炼合成失败（HTTP ${response.status}），请检查北京地域的 Key、模型权限和额度`,
    );
  const result = JSON.parse(
    (await limitedBody(response, 1024 * 1024)).toString("utf8"),
  );
  if (result.code || (result.status_code && result.status_code !== 200))
    throw new Error("百炼合成失败，请检查 Key、模型权限和额度");
  const url = result.output?.audio?.url;
  if (typeof url !== "string" || !url)
    throw new Error("百炼未返回完整音频地址");
  const audioResponse = await fetchImpl(safeAudioUrl(url), {
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  });
  if (!audioResponse.ok)
    throw new Error(`音频下载失败（HTTP ${audioResponse.status}）`);
  const audio = await limitedBody(audioResponse, 20 * 1024 * 1024);
  if (
    audio.toString("ascii", 0, 4) !== "RIFF" ||
    audio.toString("ascii", 8, 12) !== "WAVE"
  )
    throw new Error("百炼返回的音频不是有效 WAV 文件");
  return audio;
}
