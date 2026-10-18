import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  configWithClientApiKey,
  isAllowedVoice,
  readCachedAudio,
  readVolcTtsConfig,
  synthesizeVolcTts,
  volcTtsConfigured,
  writeCachedAudio,
  type VolcTtsConfig,
} from "./server/tts.ts";
import {
  isUserStateName,
  readUserState,
  writeUserState,
  type UserStateName,
} from "./server/userState.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROGRESS_FILE = path.resolve(__dirname, "user", "progress.json");
const USER_DIR = path.resolve(__dirname, "user");
const MAX_TTS_TEXT_LENGTH = 600;
const MAX_STATE_BODY_BYTES = 5 * 1024 * 1024;

function handleProgress(req: IncomingMessage, res: ServerResponse): void {
  if (req.method === "GET") {
    try {
      const raw = fs.readFileSync(PROGRESS_FILE, "utf8");
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(raw);
    } catch {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end("null");
    }
    return;
  }

  if (req.method === "PUT") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        const parsed = JSON.parse(body);
        fs.mkdirSync(path.dirname(PROGRESS_FILE), { recursive: true });
        fs.writeFileSync(
          PROGRESS_FILE,
          JSON.stringify(parsed, null, 2),
          "utf8"
        );
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end("ok");
      } catch {
        res.statusCode = 400;
        res.end("bad request");
      }
    });
    return;
  }

  res.statusCode = 405;
  res.end("method not allowed");
}

/** 提供 /api/progress 读写接口，dev 与 preview 都可用 */
function progressApiPlugin(): Plugin {
  const middleware = (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void
  ): void => {
    if (req.url?.startsWith("/api/progress")) {
      handleProgress(req, res);
    } else {
      next();
    }
  };

  return {
    name: "jp-learn-progress-api",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

function handleUserState(
  req: IncomingMessage,
  res: ServerResponse,
  name: UserStateName
): void {
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "GET") {
    try {
      const raw = readUserState(USER_DIR, name);
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(raw ?? "null");
    } catch {
      sendJson(res, 500, { error: "read-failed" });
    }
    return;
  }

  if (req.method === "PUT") {
    let body = "";
    let tooLarge = false;
    req.setEncoding("utf8");
    req.on("data", (chunk: string) => {
      if (tooLarge) return;
      body += chunk;
      if (Buffer.byteLength(body, "utf8") > MAX_STATE_BODY_BYTES) {
        tooLarge = true;
        body = "";
      }
    });
    req.on("end", () => {
      if (tooLarge) {
        sendJson(res, 413, { error: "state-too-large" });
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(body);
      } catch {
        sendJson(res, 400, { error: "invalid-json" });
        return;
      }
      if (
        parsed === null ||
        typeof parsed !== "object" ||
        Array.isArray(parsed)
      ) {
        sendJson(res, 400, { error: "invalid-state" });
        return;
      }
      try {
        writeUserState(USER_DIR, name, parsed);
        sendJson(res, 200, { ok: true });
      } catch {
        sendJson(res, 500, { error: "write-failed" });
      }
    });
    return;
  }

  res.statusCode = 405;
  res.end("method not allowed");
}

/** 白名单内的学习进度文件：/api/state/scenarios、/api/state/input-learning */
function userStatePlugin(): Plugin {
  const middleware = (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void
  ): void => {
    const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
    if (!pathname.startsWith("/api/state/")) {
      next();
      return;
    }
    const name = pathname.slice("/api/state/".length);
    if (!isUserStateName(name)) {
      sendJson(res, 404, { error: "unknown-state" });
      return;
    }
    handleUserState(req, res, name);
  };

  return {
    name: "jp-learn-user-state",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

function sendJson(
  res: ServerResponse,
  status: number,
  payload: unknown
): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function handleTts(
  req: IncomingMessage,
  res: ServerResponse,
  config: VolcTtsConfig
): void {
  const url = new URL(req.url ?? "/", "http://localhost");

  if (url.pathname === "/api/tts/status") {
    sendJson(res, 200, {
      configured: volcTtsConfigured(config),
      serverConfigured: volcTtsConfigured(config),
      voice: config.voice,
      authMode: config.authMode,
      resourceId: config.resourceId,
    });
    return;
  }

  // 页面手动输入的 Key 通过请求头传入，只用于本次请求，不落盘
  const requestConfig = configWithClientApiKey(
    config,
    req.headers["x-volc-api-key"] as string | undefined
  );
  const text = (url.searchParams.get("text") ?? "").trim();
  const voice = url.searchParams.get("voice") ?? requestConfig.voice;

  if (!text) {
    sendJson(res, 400, { error: "missing-text" });
    return;
  }
  if (text.length > MAX_TTS_TEXT_LENGTH) {
    sendJson(res, 400, { error: "text-too-long" });
    return;
  }
  if (!isAllowedVoice(voice)) {
    sendJson(res, 400, { error: "unsupported-voice" });
    return;
  }
  if (!volcTtsConfigured(requestConfig)) {
    sendJson(res, 503, {
      error: "not-configured",
      message:
        "未配置火山引擎 TTS。请在页面「语音设置」中填入 API Key，或在 .env 中配置服务端凭证。",
    });
    return;
  }

  const cached = readCachedAudio(requestConfig, text, voice);
  if (cached) {
    sendAudio(res, cached, voice);
    return;
  }

  synthesizeVolcTts(requestConfig, text, voice)
    .then((audio) => {
      writeCachedAudio(requestConfig, text, voice, audio);
      sendAudio(res, audio, voice);
    })
    .catch((error: unknown) => {
      sendJson(res, 502, {
        error: "synthesis-failed",
        message: error instanceof Error ? error.message : String(error),
      });
    });
}

function sendAudio(res: ServerResponse, audio: Buffer, voice: string): void {
  res.setHeader("Content-Type", "audio/mpeg");
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.setHeader("X-Tts-Voice", voice);
  res.end(audio);
}

function ttsPlugin(config: VolcTtsConfig): Plugin {
  const middleware = (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void
  ): void => {
    if (req.url?.startsWith("/api/tts")) {
      handleTts(req, res, config);
    } else {
      next();
    }
  };

  return {
    name: "jp-learn-volc-tts",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

export default defineConfig(({ mode }) => {
  const fileEnv = loadEnv(mode, process.cwd(), "");
  const env: Record<string, string | undefined> = {
    ...fileEnv,
    ...process.env,
  };
  const ttsConfig = readVolcTtsConfig(__dirname, env);

  return {
    plugins: [
      react(),
      progressApiPlugin(),
      userStatePlugin(),
      ttsPlugin(ttsConfig),
    ],
  };
});
