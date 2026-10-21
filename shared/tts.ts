export type CloudProvider = "volc" | "bailian";
export type TtsProvider = CloudProvider | "browser";
export interface TtsSelection {
  provider: TtsProvider;
  model: string;
  voice: string;
}
export interface TtsModel {
  provider: TtsProvider;
  id: string;
  label: string;
  voices: { id: string; label: string }[];
}

export const PROVIDERS = [
  { id: "browser", label: "浏览器语音" },
  { id: "volc", label: "火山引擎" },
  { id: "bailian", label: "阿里云百炼 · 北京" },
] as const;

export const VOLC_VOICES = [
  { id: "ja_female_bv522_uranus_bigtts", label: "Hana · 通用/教学女声" },
  { id: "ja_female_bv024_uranus_bigtts", label: "Bonnie · 教学场景女声" },
  { id: "ja_female_bv520_uranus_bigtts", label: "Poppy · 视频配音女声" },
  { id: "ja_female_bv521_uranus_bigtts", label: "Aoi · 角色扮演女声" },
  { id: "ja_female_bv523_uranus_bigtts", label: "Lily · 趣味口音女声" },
  { id: "ja_male_bv524_uranus_bigtts", label: "Ken · 通用男声" },
  { id: "ja_female_minimi_uranus_bigtts", label: "Minimi · 上下文遵循女声" },
  { id: "ja_female_shirou_uranus_bigtts", label: "Shirou · 角色扮演女声" },
];

export const TTS_MODELS: TtsModel[] = [
  {
    provider: "browser",
    id: "web-speech",
    label: "系统日语语音",
    voices: [{ id: "auto-ja", label: "自动选择日语音色" }],
  },
  {
    provider: "volc",
    id: "seed-tts-2.0",
    label: "豆包 TTS 2.0",
    voices: VOLC_VOICES,
  },
  {
    provider: "bailian",
    id: "qwen3-tts-flash",
    label: "Qwen3-TTS-Flash",
    voices: [
      { id: "Ono Anna", label: "Ono Anna · 小野杏" },
      { id: "Cherry", label: "Cherry · 芊悦" },
      { id: "Serena", label: "Serena · 苏瑶" },
      { id: "Ethan", label: "Ethan · 晨煦" },
    ],
  },
  {
    provider: "bailian",
    id: "cosyvoice-v3-flash",
    label: "CosyVoice-v3-Flash",
    voices: [
      { id: "loongyuuna_v3", label: "Yuuna · 日语女声" },
      { id: "loongtomoya_v3", label: "Tomoya · 日语男声" },
      { id: "loongyuuma_v3", label: "Yuuma · 日语男声" },
    ],
  },
];

export function defaultSelection(
  provider: TtsProvider = "browser",
  model?: string,
): TtsSelection {
  const entry =
    TTS_MODELS.find(
      (item) => item.provider === provider && (!model || item.id === model),
    ) ?? TTS_MODELS[0];
  return {
    provider: entry.provider,
    model: entry.id,
    voice: entry.voices[0].id,
  };
}

export function isTtsSelection(value: unknown): value is TtsSelection {
  if (!value || typeof value !== "object") return false;
  const item = value as TtsSelection;
  return TTS_MODELS.some(
    (model) =>
      model.provider === item.provider &&
      model.id === item.model &&
      model.voices.some((voice) => voice.id === item.voice),
  );
}

export function selectionLabel(selection: TtsSelection): string {
  const model = TTS_MODELS.find(
    (item) =>
      item.provider === selection.provider && item.id === selection.model,
  );
  const provider =
    PROVIDERS.find((item) => item.id === selection.provider)?.label ??
    selection.provider;
  const voice =
    model?.voices.find((item) => item.id === selection.voice)?.label ??
    selection.voice;
  return `${provider} / ${model?.label ?? selection.model} / ${voice}`;
}

export interface AudioVariant extends TtsSelection {
  id: string;
  format: "mp3" | "wav";
  sampleRate: number;
  generatedAt: string;
  legacy?: boolean;
}
export interface TtsStatus {
  configured: boolean;
  voice: string;
  providers: Record<CloudProvider, { configured: boolean }>;
  workspaceConfigured: boolean;
  defaultSelection: TtsSelection;
}
