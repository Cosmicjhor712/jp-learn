import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildTtsHeaders,
  cacheFileName,
  cacheFilePath,
  configWithClientApiKey,
  DEFAULT_API_URL,
  DEFAULT_API_KEY_RESOURCE_ID,
  DEFAULT_RESOURCE_ID,
  DEFAULT_VOICE,
  parseTtsNdjson,
  readCachedAudio,
  readVolcTtsConfig,
  volcTtsConfigured,
  writeCachedAudio,
} from "../server/tts.ts";

test("NDJSON parser joins audio chunks and stops at the final code", () => {
  const first = Buffer.from("first-chunk");
  const second = Buffer.from("second-chunk");
  const body = [
    JSON.stringify({ code: 0, data: first.toString("base64") }),
    "",
    JSON.stringify({ code: 0, data: second.toString("base64") }),
    JSON.stringify({ code: 20000000, usage: { text_words: 2 } }),
    JSON.stringify({ code: 0, data: Buffer.from("ignored").toString("base64") }),
  ].join("\n");

  assert.equal(parseTtsNdjson(body).toString(), "first-chunksecond-chunk");
});

test("NDJSON parser throws on service errors and empty audio", () => {
  assert.throws(
    () => parseTtsNdjson(JSON.stringify({ code: 3001, message: "denied" })),
    /3001: denied/
  );
  assert.throws(() => parseTtsNdjson(""), /未返回音频数据/);
  assert.throws(
    () => parseTtsNdjson(JSON.stringify({ code: 20000000 })),
    /未返回音频数据/
  );
  assert.throws(
    () =>
      parseTtsNdjson(
        JSON.stringify({ header: { code: 45000000, message: "grant failed" } })
      ),
    /45000000: grant failed/
  );
});

test("cache paths live under data/audio and are scoped by voice and text", () => {
  const config = readVolcTtsConfig("/tmp/project", {
    VOLC_TTS_API_KEY: "key",
  });
  const a = cacheFilePath(config, "こんにちは", DEFAULT_VOICE);
  const b = cacheFilePath(config, "こんにちは", DEFAULT_VOICE);
  const c = cacheFilePath(config, "こんにちは", "ja_male_bv524_uranus_bigtts");
  const d = cacheFilePath(config, "こんばんは", DEFAULT_VOICE);
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.notEqual(a, d);
  assert.match(
    a,
    new RegExp(
      `/data/audio/${DEFAULT_VOICE}/[0-9a-f]{40}\\.mp3$`
    )
  );
});

test("writeCachedAudio persists audio and records it in index.json", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jp-learn-tts-"));
  const config = {
    ...readVolcTtsConfig(tmp, { VOLC_TTS_API_KEY: "key" }),
    cacheDir: path.join(tmp, "audio"),
  };
  const audio = Buffer.from("fake-audio-bytes");

  writeCachedAudio(config, "こんにちは", DEFAULT_VOICE, audio);
  assert.deepEqual(
    readCachedAudio(config, "こんにちは", DEFAULT_VOICE),
    audio
  );

  const index = JSON.parse(
    fs.readFileSync(path.join(config.cacheDir, "index.json"), "utf8")
  ) as {
    version: number;
    entries: Record<string, { text: string; voice: string }>;
  };
  const key = `${DEFAULT_VOICE}/${cacheFileName("こんにちは")}`;
  assert.equal(index.version, 1);
  assert.equal(index.entries[key].text, "こんにちは");
  assert.equal(index.entries[key].voice, DEFAULT_VOICE);

  fs.rmSync(tmp, { recursive: true, force: true });
});

test("config reads env with defaults and access-key fallback", () => {
  const empty = readVolcTtsConfig("/tmp/project", {});
  assert.equal(empty.apiKey, "");
  assert.equal(empty.appId, "");
  assert.equal(empty.authMode, null);
  assert.equal(empty.resourceIdExplicit, false);
  assert.equal(empty.voice, DEFAULT_VOICE);
  assert.equal(empty.resourceId, DEFAULT_RESOURCE_ID);
  assert.equal(empty.apiUrl, DEFAULT_API_URL);
  assert.equal(volcTtsConfigured(empty), false);

  const tokenOnly = readVolcTtsConfig("/tmp/project", {
    VOLC_TTS_APP_ID: " app ",
    VOLC_TTS_TOKEN: " token ",
    VOLC_TTS_VOICE: "ja_male_bv524_uranus_bigtts",
  });
  assert.equal(tokenOnly.appId, "app");
  assert.equal(tokenOnly.accessKey, "token");
  assert.equal(tokenOnly.authMode, "app-id");
  assert.equal(tokenOnly.voice, "ja_male_bv524_uranus_bigtts");
  assert.equal(volcTtsConfigured(tokenOnly), true);
});

test("API key mode uses seed-tts-2.0 and X-Api-Key headers", () => {
  const config = readVolcTtsConfig("/tmp/project", {
    VOLC_TTS_API_KEY: " key-123 ",
    // 同时设置旧凭证时，API Key 优先
    VOLC_TTS_APP_ID: "app",
    VOLC_TTS_ACCESS_KEY: "token",
  });

  assert.equal(config.authMode, "api-key");
  assert.equal(config.resourceId, DEFAULT_API_KEY_RESOURCE_ID);

  const headers = buildTtsHeaders(config);
  assert.equal(headers["X-Api-Key"], "key-123");
  assert.equal(headers["X-Api-Resource-Id"], "seed-tts-2.0");
  assert.match(headers["X-Api-Request-Id"], /^[0-9a-f-]{36}$/);
  assert.equal(headers["X-Api-App-Id"], undefined);
  assert.equal(headers["X-Api-Access-Key"], undefined);
});

test("legacy app-id mode keeps old headers and resource id", () => {
  const config = readVolcTtsConfig("/tmp/project", {
    VOLC_TTS_APP_ID: "app",
    VOLC_TTS_ACCESS_KEY: "token",
  });

  assert.equal(config.authMode, "app-id");
  assert.equal(config.resourceId, DEFAULT_RESOURCE_ID);

  const headers = buildTtsHeaders(config);
  assert.equal(headers["X-Api-App-Id"], "app");
  assert.equal(headers["X-Api-Access-Key"], "token");
  assert.equal(headers["X-Api-Resource-Id"], "volc.service_type.10029");
  assert.equal(headers["X-Api-Key"], undefined);
});

test("explicit resource id overrides mode defaults", () => {
  const config = readVolcTtsConfig("/tmp/project", {
    VOLC_TTS_API_KEY: "key",
    VOLC_TTS_RESOURCE_ID: "custom.resource",
  });
  assert.equal(config.resourceId, "custom.resource");
  assert.equal(config.resourceIdExplicit, true);
});

test("client-provided API key overrides legacy env credentials", () => {
  const legacy = readVolcTtsConfig("/tmp/project", {
    VOLC_TTS_APP_ID: "app",
    VOLC_TTS_ACCESS_KEY: "token",
  });
  const withKey = configWithClientApiKey(legacy, " client-key ");

  assert.equal(withKey.authMode, "api-key");
  assert.equal(withKey.apiKey, "client-key");
  assert.equal(withKey.resourceId, DEFAULT_API_KEY_RESOURCE_ID);

  const headers = buildTtsHeaders(withKey);
  assert.equal(headers["X-Api-Key"], "client-key");
  assert.equal(headers["X-Api-App-Id"], undefined);
});

test("client key keeps an explicit resource id and empty key keeps env config", () => {
  const explicit = readVolcTtsConfig("/tmp/project", {
    VOLC_TTS_RESOURCE_ID: "custom.resource",
  });
  assert.equal(
    configWithClientApiKey(explicit, "client-key").resourceId,
    "custom.resource"
  );

  const legacy = readVolcTtsConfig("/tmp/project", {
    VOLC_TTS_APP_ID: "app",
    VOLC_TTS_ACCESS_KEY: "token",
  });
  assert.equal(configWithClientApiKey(legacy, "   "), legacy);
});
