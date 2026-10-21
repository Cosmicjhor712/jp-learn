import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import {
  isTtsSelection,
  VOLC_VOICES,
  type AudioVariant,
  type TtsSelection,
} from "../shared/tts.ts";
import { cacheFileName } from "./tts.ts";

export interface AudioParameters {
  format: "wav" | "mp3";
  sampleRate: number;
  language: string;
  engine: string;
}
interface AudioRecord extends AudioVariant {
  version: 2;
  text: string;
  parameters: AudioParameters;
}
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export function audioId(
  text: string,
  selection: TtsSelection,
  params: AudioParameters,
): string {
  return hash(
    JSON.stringify([
      text.trim(),
      selection.provider,
      selection.model,
      selection.voice,
      params.format,
      params.sampleRate,
      params.language,
      params.engine,
    ]),
  );
}
function directory(root: string, text: string): string {
  return path.join(root, "tts", hash(text.trim()));
}
function publicRecord(record: AudioRecord): AudioVariant {
  const { id, provider, model, voice, format, sampleRate, generatedAt } =
    record;
  return { id, provider, model, voice, format, sampleRate, generatedAt };
}

export function listAudio(root: string, text: string): AudioVariant[] {
  text = text.trim();
  const entries: AudioVariant[] = [];
  const dir = directory(root, text);
  if (fs.existsSync(dir)) {
    for (const name of fs.readdirSync(dir)) {
      if (!/^[a-f0-9]{64}\.json$/.test(name)) continue;
      try {
        const record: AudioRecord = JSON.parse(
          fs.readFileSync(path.join(dir, name), "utf8"),
        );
        if (
          record.version !== 2 ||
          record.text !== text ||
          !isTtsSelection(record) ||
          record.provider === "browser" ||
          !["mp3", "wav"].includes(record.format) ||
          record.format !== record.parameters.format ||
          record.sampleRate !== record.parameters.sampleRate ||
          !Number.isFinite(Date.parse(record.generatedAt)) ||
          record.id !== name.slice(0, -5) ||
          record.id !== audioId(text, record, record.parameters)
        )
          continue;
        if (
          fs.statSync(path.join(dir, `${record.id}.${record.format}`)).size > 0
        )
          entries.push(publicRecord(record));
      } catch {
        /* Ignore incomplete or damaged cache records, never modify them on read. */
      }
    }
  }
  for (const voice of VOLC_VOICES) {
    const file = path.join(root, voice.id, cacheFileName(text));
    try {
      const stat = fs.statSync(file);
      if (stat.size > 0)
        entries.push({
          id: `legacy-${voice.id}`,
          provider: "volc",
          model: "seed-tts-2.0",
          voice: voice.id,
          format: "mp3",
          sampleRate: 24000,
          generatedAt: stat.mtime.toISOString(),
          legacy: true,
        });
    } catch {
      /* Legacy recordings remain readable without rewriting their index. */
    }
  }
  return entries.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
}

export function readAudio(
  root: string,
  text: string,
  id: string,
): { audio: Buffer; variant: AudioVariant } | null {
  const variant = listAudio(root, text).find((item) => item.id === id);
  if (!variant) return null;
  const file = variant.legacy
    ? path.join(root, variant.voice, cacheFileName(text.trim()))
    : path.join(directory(root, text), `${id}.${variant.format}`);
  try {
    return { audio: fs.readFileSync(file), variant };
  } catch {
    return null;
  }
}

export function writeAudio(
  root: string,
  text: string,
  selection: TtsSelection,
  parameters: AudioParameters,
  audio: Buffer,
): AudioVariant {
  if (!audio.length) throw new Error("合成返回空音频");
  text = text.trim();
  const id = audioId(text, selection, parameters);
  const record: AudioRecord = {
    ...selection,
    version: 2,
    id,
    text,
    parameters,
    format: parameters.format,
    sampleRate: parameters.sampleRate,
    generatedAt: new Date().toISOString(),
  };
  const dir = directory(root, text);
  fs.mkdirSync(dir, { recursive: true });
  // Separate metadata per version avoids lost index updates from concurrent sentences.
  for (const [extension, body] of [
    [parameters.format, audio],
    ["json", JSON.stringify(record, null, 2) + "\n"],
  ] as const) {
    const target = path.join(dir, `${id}.${extension}`);
    const tmp = `${target}.${randomUUID()}.tmp`;
    try {
      fs.writeFileSync(tmp, body);
      fs.renameSync(tmp, target);
    } finally {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    }
  }
  return publicRecord(record);
}
