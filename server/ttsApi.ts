import type { IncomingMessage, ServerResponse } from "node:http";
import { createHash } from "node:crypto";
import {
  defaultSelection,
  isTtsSelection,
  type TtsStatus,
} from "../shared/tts.ts";
import {
  audioId,
  listAudio,
  readAudio,
  writeAudio,
  type AudioParameters,
} from "./audioLibrary.ts";
import {
  bailianRequest,
  readBailianConfig,
  synthesizeBailian,
} from "./bailianTts.ts";
import {
  configWithClientApiKey,
  DEFAULT_API_URL,
  readVolcTtsConfig,
  synthesizeVolcTts,
  volcTtsConfigured,
} from "./tts.ts";

export class TtsError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export interface TtsCredentials {
  volc?: string;
  bailian?: string;
  workspaceId?: string;
}

export function createTtsService(
  root: string,
  env: Record<string, string | undefined>,
  fetchImpl: typeof fetch = fetch,
) {
  const volc = readVolcTtsConfig(root, env);
  const bailian = readBailianConfig(env);
  const pending = new Map<
    string,
    Promise<NonNullable<ReturnType<typeof readAudio>>>
  >();
  const status: TtsStatus = {
    configured: volcTtsConfigured(volc) || !!bailian.apiKey,
    voice: volc.voice,
    providers: {
      volc: { configured: volcTtsConfigured(volc) },
      bailian: { configured: !!bailian.apiKey },
    },
    workspaceConfigured: !!bailian.workspaceId,
    defaultSelection: volcTtsConfigured(volc)
      ? { ...defaultSelection("volc"), voice: volc.voice }
      : bailian.apiKey
        ? defaultSelection("bailian")
        : defaultSelection(),
  };
  function validateText(value: unknown): string {
    if (typeof value !== "string" || !value.trim() || value.trim().length > 600)
      throw new TtsError(400, "日语文本须为 1 到 600 个字符");
    return value.trim();
  }
  function variants(text: unknown) {
    return listAudio(volc.cacheDir, validateText(text));
  }
  function cached(text: unknown, id: string) {
    const audio = readAudio(volc.cacheDir, validateText(text), id);
    if (!audio)
      throw new TtsError(404, "这份录音已不存在，请重新选择；未自动生成或扣费");
    return audio;
  }
  async function generate(
    value: unknown,
    selection: unknown,
    credentials: TtsCredentials = {},
  ) {
    const text = validateText(value);
    if (!isTtsSelection(selection) || selection.provider === "browser")
      throw new TtsError(400, "供应商、模型与音色不匹配");
    const requestVolc = configWithClientApiKey(volc, credentials.volc);
    const requestBailian = {
      apiKey: credentials.bailian?.trim() || bailian.apiKey,
      workspaceId: credentials.workspaceId?.trim() || bailian.workspaceId,
    };
    const parameters: AudioParameters = {
      format: selection.provider === "volc" ? "mp3" : "wav",
      sampleRate: 24000,
      language: "ja",
      engine:
        selection.provider === "volc"
          ? `${requestVolc.apiUrl}|${!requestVolc.authMode && !requestVolc.resourceIdExplicit ? "seed-tts-2.0" : requestVolc.resourceId}`
          : "bailian-beijing-http-v1",
    };
    const id = audioId(text, selection, parameters);
    const existing = readAudio(volc.cacheDir, text, id);
    if (existing) return existing;
    if (
      selection.provider === "volc" &&
      requestVolc.apiUrl === DEFAULT_API_URL &&
      ["seed-tts-2.0", "volc.service_type.10029"].includes(
        requestVolc.resourceId,
      )
    ) {
      const legacy = readAudio(
        volc.cacheDir,
        text,
        `legacy-${selection.voice}`,
      );
      if (legacy) return legacy;
    }
    if (
      selection.provider === "volc"
        ? !volcTtsConfigured(requestVolc)
        : !requestBailian.apiKey
    )
      throw new TtsError(
        503,
        "当前配置没有缓存，且未填写该供应商的 Key；请选择已有录音，或打开语音设置",
      );
    if (selection.provider === "bailian") {
      try {
        bailianRequest(requestBailian, selection, text);
      } catch (error) {
        throw new TtsError(
          400,
          error instanceof Error ? error.message : "百炼配置不正确",
        );
      }
    }
    // Include the credential identity only in the in-memory deduplication key.
    const credential =
      selection.provider === "volc"
        ? requestVolc.apiKey || requestVolc.accessKey
        : requestBailian.apiKey;
    const flight = `${id}:${createHash("sha256").update(credential).digest("hex")}`;
    const active = pending.get(flight);
    if (active) return active;
    const operation = (async () => {
      let audio: Buffer;
      if (selection.provider === "volc") {
        try {
          audio = await synthesizeVolcTts(
            requestVolc,
            text,
            selection.voice,
            fetchImpl,
          );
        } catch {
          throw new TtsError(
            502,
            "火山引擎合成失败，请检查 Key、资源 ID、音色权限和网络；未切换其他供应商",
          );
        }
      } else {
        audio = await synthesizeBailian(
          requestBailian,
          selection,
          text,
          fetchImpl,
        );
      }
      const variant = writeAudio(
        volc.cacheDir,
        text,
        selection,
        parameters,
        audio,
      );
      return { audio, variant };
    })();
    pending.set(flight, operation);
    try {
      return await operation;
    } finally {
      pending.delete(flight);
    }
  }
  return { status, variants, cached, generate };
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16_384) throw new TtsError(413, "请求内容过大");
    chunks.push(Buffer.from(chunk));
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new TtsError(400, "请求不是有效 JSON");
  }
}
function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

export function createTtsMiddleware(
  service: ReturnType<typeof createTtsService>,
) {
  return (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ): void => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname !== "/api/tts" && !url.pathname.startsWith("/api/tts/")) {
      next();
      return;
    }
    void (async () => {
      const origin = req.headers.origin;
      if (
        (origin && new URL(origin).host !== req.headers.host) ||
        req.headers["sec-fetch-site"] === "cross-site"
      )
        throw new TtsError(403, "仅支持同源语音请求");
      if (url.pathname === "/api/tts/status" && req.method === "GET") {
        json(res, 200, service.status);
        return;
      }
      if (url.pathname === "/api/tts/variants" && req.method === "GET") {
        json(res, 200, {
          variants: service.variants(url.searchParams.get("text")),
        });
        return;
      }
      let result: Awaited<ReturnType<typeof service.generate>>;
      if (url.pathname === "/api/tts/audio" && req.method === "GET") {
        result = service.cached(
          url.searchParams.get("text"),
          url.searchParams.get("id") ?? "",
        );
      } else if (
        url.pathname === "/api/tts" &&
        ["POST", "GET"].includes(req.method ?? "")
      ) {
        const body =
          req.method === "POST"
            ? ((await readBody(req)) as { text?: unknown; selection?: unknown })
            : {
                text: url.searchParams.get("text"),
                selection: {
                  ...defaultSelection("volc"),
                  voice: url.searchParams.get("voice") ?? service.status.voice,
                },
              };
        const header = (name: string) =>
          typeof req.headers[name] === "string"
            ? (req.headers[name] as string)
            : undefined;
        result = await service.generate(body?.text, body?.selection, {
          volc: header("x-volc-api-key"),
          bailian: header("x-bailian-api-key"),
          workspaceId: header("x-bailian-workspace-id"),
        });
      } else {
        throw new TtsError(405, "不支持的语音接口或请求方法");
      }
      res.setHeader(
        "Content-Type",
        result.variant.format === "wav" ? "audio/wav" : "audio/mpeg",
      );
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("X-Tts-Variant", result.variant.id);
      res.end(result.audio);
    })().catch((error: unknown) => {
      if (res.destroyed) return;
      json(res, error instanceof TtsError ? error.status : 502, {
        error: "tts-error",
        message:
          error instanceof TtsError
            ? error.message
            : "百炼合成或音频保存失败，请检查 Key、北京业务空间、模型权限及网络；未切换其他供应商",
      });
    });
  };
}
