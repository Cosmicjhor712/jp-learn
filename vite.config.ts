import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { IncomingMessage, ServerResponse } from "node:http";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROGRESS_FILE = path.resolve(__dirname, "user", "progress.json");

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

export default defineConfig({
  plugins: [react(), progressApiPlugin()],
});
