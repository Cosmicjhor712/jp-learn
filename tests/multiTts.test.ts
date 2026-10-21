import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import test, { type TestContext } from "node:test";
import { defaultSelection, isTtsSelection } from "../shared/tts.ts";
import {
  audioId,
  listAudio,
  readAudio,
  writeAudio,
  type AudioParameters,
} from "../server/audioLibrary.ts";
import {
  bailianRequest,
  safeAudioUrl,
  synthesizeBailian,
} from "../server/bailianTts.ts";
import { createTtsMiddleware, createTtsService } from "../server/ttsApi.ts";
import { readVolcTtsConfig, writeCachedAudio } from "../server/tts.ts";

const sentence = "こんにちは。";
const qwen = defaultSelection("bailian");
const cosy = defaultSelection("bailian", "cosyvoice-v3-flash");
const volc = defaultSelection("volc");
const params: AudioParameters = {
  format: "wav",
  sampleRate: 24000,
  language: "ja",
  engine: "bailian-beijing-http-v1",
};
const wav = Buffer.from("RIFF0000WAVEtest-audio");
function temp(t: TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jp-multi-tts-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
function fakeBailian(
  calls: { url: string; options?: RequestInit }[],
): typeof fetch {
  return async (url, options) => {
    calls.push({ url: String(url), options });
    if (options?.method === "POST")
      return Response.json({
        output: {
          audio: {
            url: "http://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/test.wav?signed=1",
          },
        },
      });
    return new Response(wav);
  };
}

test("catalogue validates provider/model/voice combinations", () => {
  assert.ok(isTtsSelection(qwen));
  assert.ok(isTtsSelection(cosy));
  assert.equal(isTtsSelection({ ...cosy, voice: "Cherry" }), false);
  assert.equal(isTtsSelection({ ...qwen, provider: "volc" }), false);
  assert.equal(isTtsSelection(null), false);
});
test("Qwen and CosyVoice use their documented HTTP bodies", () => {
  const q = bailianRequest({ apiKey: "key", workspaceId: "" }, qwen, sentence);
  assert.match(
    q.url,
    /^https:\/\/dashscope\.aliyuncs\.com\/api\/v1\/services\/aigc\/multimodal-generation\/generation$/,
  );
  assert.deepEqual(q.body.input, {
    text: sentence,
    voice: "Ono Anna",
    language_type: "Japanese",
  });
  const c = bailianRequest(
    { apiKey: "key", workspaceId: "llm-example" },
    cosy,
    sentence,
  );
  assert.equal(
    c.url,
    "https://llm-example.cn-beijing.maas.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer",
  );
  assert.deepEqual(c.body.input, {
    text: sentence,
    voice: "loongyuuna_v3",
    format: "wav",
    sample_rate: 24000,
  });
  assert.throws(
    () => bailianRequest({ apiKey: "key", workspaceId: "" }, cosy, sentence),
    /业务空间/,
  );
  assert.throws(
    () =>
      bailianRequest(
        { apiKey: "key", workspaceId: "localhost/../" },
        qwen,
        sentence,
      ),
    /格式/,
  );
});
test("Bailian audio download upgrades HTTP and never forwards credentials", async () => {
  const calls: { url: string; options?: RequestInit }[] = [];
  assert.deepEqual(
    await synthesizeBailian(
      { apiKey: "secret", workspaceId: "" },
      qwen,
      sentence,
      fakeBailian(calls),
    ),
    wav,
  );
  assert.equal(
    new Headers(calls[0].options?.headers).get("Authorization"),
    "Bearer secret",
  );
  assert.match(calls[1].url, /^https:/);
  assert.equal(calls[1].options?.headers, undefined);
  assert.equal(calls[0].options?.redirect, "error");
  assert.equal(calls[1].options?.redirect, "error");
});
test("download URL validation rejects SSRF, userinfo, unexpected ports and lookalike domains", () => {
  for (const url of [
    "http://127.0.0.1/a",
    "file:///secret",
    "https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com.evil.com/a",
    "https://key@dashscope-result-bj.oss-cn-beijing.aliyuncs.com/a",
    "https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com:123/a",
  ])
    assert.throws(() => safeAudioUrl(url));
});
test("failed or empty synthesis is not accepted as audio", async () => {
  await assert.rejects(
    synthesizeBailian(
      { apiKey: "key", workspaceId: "" },
      qwen,
      sentence,
      async () => new Response("key", { status: 401 }),
    ),
    /HTTP 401/,
  );
  await assert.rejects(
    synthesizeBailian(
      { apiKey: "key", workspaceId: "" },
      qwen,
      sentence,
      async () => Response.json({ output: { audio: {} } }),
    ),
    /完整音频/,
  );
  let calls = 0;
  await assert.rejects(
    synthesizeBailian(
      { apiKey: "key", workspaceId: "" },
      qwen,
      sentence,
      async () =>
        ++calls === 1
          ? Response.json({
              output: {
                audio: {
                  url: "https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/a",
                },
              },
            })
          : new Response("not audio"),
    ),
    /WAV/,
  );
});
test("cache identity includes text, provider, model, voice and synthesis parameters", () => {
  const id = audioId(sentence, qwen, params);
  for (const different of [
    audioId("こんばんは。", qwen, params),
    audioId(sentence, cosy, params),
    audioId(sentence, { ...qwen, voice: "Cherry" }, params),
    audioId(sentence, qwen, { ...params, sampleRate: 48000 }),
    audioId(sentence, qwen, { ...params, engine: "v2" }),
  ])
    assert.notEqual(id, different);
  assert.equal(id, audioId(` ${sentence} `, qwen, params));
});
test("multiple versions coexist and listing is read-only with legacy compatibility", (t) => {
  const root = temp(t);
  const config = readVolcTtsConfig(root, {});
  writeCachedAudio(config, sentence, volc.voice, Buffer.from("legacy"));
  const originalIndex = fs.readFileSync(
    path.join(config.cacheDir, "index.json"),
    "utf8",
  );
  const a = writeAudio(config.cacheDir, sentence, qwen, params, wav);
  const b = writeAudio(config.cacheDir, sentence, cosy, params, wav);
  const c = writeAudio(
    config.cacheDir,
    sentence,
    { ...qwen, voice: "Cherry" },
    params,
    wav,
  );
  assert.equal(listAudio(config.cacheDir, sentence).length, 4);
  assert.equal(listAudio(config.cacheDir, "别的句子").length, 0);
  for (const variant of [a, b, c])
    assert.deepEqual(
      readAudio(config.cacheDir, sentence, variant.id)?.audio,
      wav,
    );
  assert.equal(readAudio(config.cacheDir, sentence, "../../.env"), null);
  assert.equal(
    fs.readFileSync(path.join(config.cacheDir, "index.json"), "utf8"),
    originalIndex,
  );
});
test("missing or malformed files are excluded, never substituted with another recording", (t) => {
  const root = temp(t);
  const v = writeAudio(root, sentence, qwen, params, wav);
  const textDir = fs.readdirSync(path.join(root, "tts"))[0];
  const file = path.join(root, "tts", textDir, `${v.id}.wav`);
  fs.unlinkSync(file);
  assert.deepEqual(listAudio(root, sentence), []);
  assert.equal(readAudio(root, sentence, v.id), null);
  fs.writeFileSync(path.join(root, "tts", textDir, `${v.id}.json`), "{");
  assert.deepEqual(listAudio(root, sentence), []);
});
test("cache hit and legacy playback need no credentials or network", async (t) => {
  const root = temp(t);
  const config = readVolcTtsConfig(root, {});
  writeAudio(config.cacheDir, sentence, qwen, params, wav);
  writeCachedAudio(config, sentence, volc.voice, Buffer.from("legacy"));
  const service = createTtsService(root, {}, async () => {
    throw new Error("network forbidden");
  });
  assert.deepEqual((await service.generate(sentence, qwen)).audio, wav);
  assert.equal(
    (await service.generate(sentence, volc)).audio.toString(),
    "legacy",
  );
  assert.throws(() => service.cached(sentence, "missing"), /未自动生成/);
  await assert.rejects(service.generate("新的一句", qwen), /未填写/);
});
test("concurrent identical generation is coalesced and can be replayed without a key", async (t) => {
  const root = temp(t);
  const calls: { url: string; options?: RequestInit }[] = [];
  const service = createTtsService(root, {}, fakeBailian(calls));
  const results = await Promise.all(
    Array.from({ length: 5 }, () =>
      service.generate(sentence, qwen, { bailian: "client-secret" }),
    ),
  );
  assert.equal(calls.length, 2);
  assert.ok(
    results.every((result) => result.variant.id === results[0].variant.id),
  );
  assert.deepEqual((await service.generate(sentence, qwen)).audio, wav);
  assert.equal(calls.length, 2);
  assert.equal(service.variants(sentence).length, 1);
  const file = fs.readdirSync(path.join(root, "data", "audio", "tts"))[0];
  const metadata = fs.readFileSync(
    path.join(
      root,
      "data",
      "audio",
      "tts",
      file,
      `${results[0].variant.id}.json`,
    ),
    "utf8",
  );
  assert.equal(metadata.includes("client-secret"), false);
});
test("Volc cache identity is stable when a session API key is later removed", async (t) => {
  const service = createTtsService(
    temp(t),
    {},
    async () =>
      new Response(
        JSON.stringify({
          code: 0,
          data: Buffer.from("mp3").toString("base64"),
        }),
      ),
  );
  const first = await service.generate(sentence, volc, { volc: "test-key" });
  assert.equal(
    (await service.generate(sentence, volc)).variant.id,
    first.variant.id,
  );
});
test("provider credentials never cross over and status contains no keys", async (t) => {
  const calls: { url: string; options?: RequestInit }[] = [];
  const service = createTtsService(
    temp(t),
    { VOLC_TTS_API_KEY: "volc-env", DASHSCOPE_API_KEY: "bailian-env" },
    fakeBailian(calls),
  );
  await service.generate(sentence, qwen, {
    volc: "wrong-key",
    bailian: "bailian-client",
  });
  assert.equal(
    new Headers(calls[0].options?.headers).get("Authorization"),
    "Bearer bailian-client",
  );
  assert.equal(JSON.stringify(service.status).includes("-env"), false);
  assert.equal(
    new Headers(calls[0].options?.headers).get("x-volc-api-key"),
    null,
  );
  await assert.rejects(
    service.generate(sentence, { ...qwen, voice: "loongyuuna_v3" }),
    /不匹配/,
  );
  assert.equal(calls.length, 2);
});
test("HTTP API lists and serves cached variants, rejects stale IDs and cross-origin synthesis", async (t) => {
  const root = temp(t);
  const config = readVolcTtsConfig(root, {});
  const variant = writeAudio(config.cacheDir, sentence, qwen, params, wav);
  const service = createTtsService(root, {}, async () => {
    throw new Error("network forbidden");
  });
  const middleware = createTtsMiddleware(service);
  const server = createServer((req, res) =>
    middleware(req, res, () => {
      res.statusCode = 404;
      res.end();
    }),
  );
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(
    () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  );
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const list = await fetch(
    `${base}/api/tts/variants?text=${encodeURIComponent(sentence)}`,
  );
  assert.equal((await list.json()).variants[0].id, variant.id);
  const audio = await fetch(
    `${base}/api/tts/audio?${new URLSearchParams({ text: sentence, id: variant.id })}`,
  );
  assert.equal(audio.headers.get("content-type"), "audio/wav");
  assert.deepEqual(Buffer.from(await audio.arrayBuffer()), wav);
  assert.equal(
    (
      await fetch(
        `${base}/api/tts/audio?${new URLSearchParams({ text: sentence, id: "missing" })}`,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await fetch(`${base}/api/tts`, {
        method: "POST",
        headers: { origin: "https://evil.example" },
        body: "{}",
      })
    ).status,
    403,
  );
  assert.equal(
    (await fetch(`${base}/api/tts`, { method: "POST", body: "{" })).status,
    400,
  );
  assert.equal(
    (await fetch(`${base}/api/tts/status`, { method: "DELETE" })).status,
    405,
  );
  assert.equal(
    (await fetch(`${base}/api/tts/variants?text=${"a".repeat(601)}`)).status,
    400,
  );
});
