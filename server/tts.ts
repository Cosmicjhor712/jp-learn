// ============================================================
// 火山引擎语音合成（豆包 TTS 2.0）服务端代理
//
// 接口：POST https://openspeech.bytedance.com/api/v3/tts/unidirectional
// 文档：https://www.volcengine.com/docs/6561/1598757
//
// 凭证只从环境变量读取，不会暴露给浏览器。
// ============================================================

import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const DEFAULT_VOICE = "ja_female_bv522_uranus_bigtts";
export const DEFAULT_API_URL =
  "https://openspeech.bytedance.com/api/v3/tts/unidirectional";
/** 新版控制台 API Key 模式的默认资源 ID */
export const DEFAULT_API_KEY_RESOURCE_ID = "seed-tts-2.0";
/** 旧版 APP ID + Access Token 模式的默认资源 ID */
export const DEFAULT_RESOURCE_ID = "volc.service_type.10029";

export type VolcTtsAuthMode = "api-key" | "app-id";

export interface VolcTtsConfig {
  apiKey: string;
  appId: string;
  accessKey: string;
  authMode: VolcTtsAuthMode | null;
  resourceIdExplicit: boolean;
  resourceId: string;
  voice: string;
  apiUrl: string;
  cacheDir: string;
}

/** 官方文档中的日语大模型音色（豆包语音合成 2.0） */
export const JAPANESE_VOICES: { id: string; label: string }[] = [
  { id: "ja_female_bv522_uranus_bigtts", label: "Hana · 通用/教学女声" },
  { id: "ja_female_bv024_uranus_bigtts", label: "Bonnie · 教学场景女声" },
  { id: "ja_female_bv520_uranus_bigtts", label: "Poppy · 视频配音女声" },
  { id: "ja_female_bv521_uranus_bigtts", label: "Aoi · 角色扮演女声" },
  { id: "ja_female_bv523_uranus_bigtts", label: "Lily · 趣味口音女声" },
  { id: "ja_male_bv524_uranus_bigtts", label: "Ken · 通用男声" },
  { id: "ja_female_minimi_uranus_bigtts", label: "Minimi · 上下文遵循女声" },
  { id: "ja_female_shirou_uranus_bigtts", label: "Shirou · 角色扮演女声" },
];

const VOICE_IDS = new Set(JAPANESE_VOICES.map((voice) => voice.id));

export function isAllowedVoice(voice: string): boolean {
  return VOICE_IDS.has(voice);
}

export interface TtsIndexEntry {
  text: string;
  voice: string;
  generatedAt: string;
}

export interface TtsIndex {
  version: 1;
  entries: Record<string, TtsIndexEntry>;
}

export function readVolcTtsConfig(
  rootDir: string,
  env: Record<string, string | undefined> = process.env
): VolcTtsConfig {
  const apiKey = env.VOLC_TTS_API_KEY?.trim() ?? "";
  const appId = env.VOLC_TTS_APP_ID?.trim() ?? "";
  const accessKey =
    env.VOLC_TTS_ACCESS_KEY?.trim() ?? env.VOLC_TTS_TOKEN?.trim() ?? "";
  const authMode: VolcTtsAuthMode | null = apiKey
    ? "api-key"
    : appId && accessKey
      ? "app-id"
      : null;
  const explicitResourceId = env.VOLC_TTS_RESOURCE_ID?.trim() ?? "";

  return {
    apiKey,
    appId,
    accessKey,
    authMode,
    resourceIdExplicit: Boolean(explicitResourceId),
    resourceId:
      explicitResourceId ||
      (authMode === "api-key"
        ? DEFAULT_API_KEY_RESOURCE_ID
        : DEFAULT_RESOURCE_ID),
    voice: env.VOLC_TTS_VOICE?.trim() || DEFAULT_VOICE,
    apiUrl: env.VOLC_TTS_API_URL?.trim() || DEFAULT_API_URL,
    // 生成后永久保存在仓库内（随 git 提交，换电脑无需重新合成）
    cacheDir: path.resolve(rootDir, "data", "audio"),
  };
}

/**
 * 页面手动输入的 API Key 优先于服务端 .env 配置。
 * 未显式指定资源 ID 时，客户端 API Key 使用 seed-tts-2.0。
 */
export function configWithClientApiKey(
  config: VolcTtsConfig,
  apiKey: string | undefined
): VolcTtsConfig {
  const key = apiKey?.trim() ?? "";
  if (!key) return config;
  return {
    ...config,
    apiKey: key,
    authMode: "api-key",
    resourceId: config.resourceIdExplicit
      ? config.resourceId
      : DEFAULT_API_KEY_RESOURCE_ID,
  };
}

export function volcTtsConfigured(config: VolcTtsConfig): boolean {
  return config.authMode !== null;
}

/** 构建鉴权 + 路由请求头（新版 API Key 优先，旧版 appid/token 兼容） */
export function buildTtsHeaders(
  config: VolcTtsConfig
): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Api-Resource-Id": config.resourceId,
    "X-Api-Request-Id": randomUUID(),
  };

  if (config.authMode === "api-key") {
    headers["X-Api-Key"] = config.apiKey;
  } else {
    headers["X-Api-App-Id"] = config.appId;
    headers["X-Api-Access-Key"] = config.accessKey;
  }

  return headers;
}

/** 缓存文件名：同一文本只合成一次（按音色分目录） */
export function cacheFileName(text: string): string {
  return createHash("sha1").update(text).digest("hex") + ".mp3";
}

export function cacheFilePath(
  config: VolcTtsConfig,
  text: string,
  voice: string
): string {
  return path.join(config.cacheDir, voice, cacheFileName(text));
}

export function readCachedAudio(
  config: VolcTtsConfig,
  text: string,
  voice: string
): Buffer | null {
  const file = cacheFilePath(config, text, voice);
  try {
    return fs.readFileSync(file);
  } catch {
    return null;
  }
}

export function writeCachedAudio(
  config: VolcTtsConfig,
  text: string,
  voice: string,
  audio: Buffer
): void {
  const file = cacheFilePath(config, text, voice);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, audio);
  fs.renameSync(tmp, file);
  updateIndex(config, text, voice, file);
}

/** 维护 data/audio/index.json：记录每段音频对应的文本与音色 */
function updateIndex(
  config: VolcTtsConfig,
  text: string,
  voice: string,
  file: string
): void {
  const indexPath = path.join(config.cacheDir, "index.json");
  let index: TtsIndex = { version: 1, entries: {} };
  try {
    const parsed = JSON.parse(
      fs.readFileSync(indexPath, "utf8")
    ) as Partial<TtsIndex>;
    if (parsed && parsed.entries && typeof parsed.entries === "object") {
      index = { version: 1, entries: parsed.entries };
    }
  } catch {
    // 索引不存在或损坏时重建
  }

  const key = path
    .relative(config.cacheDir, file)
    .split(path.sep)
    .join("/");
  index.entries[key] = {
    text,
    voice,
    generatedAt: new Date().toISOString(),
  };

  const tmp = `${indexPath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(index, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, indexPath);
}

/**
 * 解析 v3 单向流式接口返回的 NDJSON：
 * 每行一个 JSON，音频分片放在 data（base64），code=20000000 表示结束。
 */
export function parseTtsNdjson(body: string): Buffer {
  const chunks: Buffer[] = [];

  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let message: {
      code?: number;
      data?: string;
      message?: string;
      header?: { code?: number; message?: string };
    };
    try {
      message = JSON.parse(trimmed);
    } catch {
      continue;
    }

    const code = message.code ?? message.header?.code;
    const errorMessage = message.message ?? message.header?.message;

    if (code === 20000000) break;
    if (typeof code === "number" && code > 0) {
      throw new Error(
        `火山引擎 TTS 错误 ${code}: ${errorMessage ?? "未知错误"}`
      );
    }
    if (message.data) {
      chunks.push(Buffer.from(message.data, "base64"));
    }
  }

  if (chunks.length === 0) {
    throw new Error("火山引擎 TTS 未返回音频数据");
  }
  return Buffer.concat(chunks);
}

export async function synthesizeVolcTts(
  config: VolcTtsConfig,
  text: string,
  voice: string = config.voice,
  fetchImpl: typeof fetch = fetch
): Promise<Buffer> {
  const response = await fetchImpl(config.apiUrl, {
    method: "POST",
    headers: buildTtsHeaders(config),
    body: JSON.stringify({
      user: { uid: "jp-learn" },
      req_params: {
        text,
        speaker: voice,
        audio_params: { format: "mp3", sample_rate: 24000 },
        additions: JSON.stringify({
          explicit_language: "ja",
          disable_markdown_filter: true,
        }),
      },
    }),
    signal: AbortSignal.timeout(45_000),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `火山引擎 TTS HTTP ${response.status}: ${detail.slice(0, 300)}`
    );
  }

  return parseTtsNdjson(await response.text());
}
