import { toHiragana, toKana, toKatakana, toRomaji } from "wanakana";

export type KanaScript = "hiragana" | "katakana";
export type KanaGroup = "basic" | "voiced" | "combined" | "small" | "foreign";
export interface KanaItem {
  kana: string;
  keys: string;
  alternatives: string[];
  group: KanaGroup;
}
export interface InputChunk {
  text: string;
  keys: string;
  start: number;
  end: number;
}
export interface InputRule {
  id: string;
  title: string;
  explanation: string;
}

export const KANA_GROUPS: { id: KanaGroup; label: string; rows: string[] }[] = [
  {
    id: "basic",
    label: "清音",
    rows: [
      "あ い う え お",
      "か き く け こ",
      "さ し す せ そ",
      "た ち つ て と",
      "な に ぬ ね の",
      "は ひ ふ へ ほ",
      "ま み む め も",
      "や ゆ よ",
      "ら り る れ ろ",
      "わ を ん",
    ],
  },
  {
    id: "voiced",
    label: "浊音",
    rows: [
      "が ぎ ぐ げ ご",
      "ざ じ ず ぜ ぞ",
      "だ ぢ づ で ど",
      "ば び ぶ べ ぼ",
      "ぱ ぴ ぷ ぺ ぽ",
    ],
  },
  {
    id: "combined",
    label: "拗音",
    rows: [
      "きゃ きゅ きょ",
      "しゃ しゅ しょ",
      "ちゃ ちゅ ちょ",
      "にゃ にゅ にょ",
      "ひゃ ひゅ ひょ",
      "みゃ みゅ みょ",
      "りゃ りゅ りょ",
      "ぎゃ ぎゅ ぎょ",
      "じゃ じゅ じょ",
      "びゃ びゅ びょ",
      "ぴゃ ぴゅ ぴょ",
    ],
  },
  {
    id: "small",
    label: "小假名 / 长音",
    rows: ["ぁ ぃ ぅ ぇ ぉ", "ゃ ゅ ょ っ ゎ", "ー"],
  },
  {
    id: "foreign",
    label: "外来音",
    rows: [
      "ふぁ ふぃ ふぇ ふぉ",
      "てぃ でぃ とぅ どぅ",
      "うぃ うぇ うぉ",
      "しぇ じぇ ちぇ",
      "ゔ ゔぁ ゔぃ ゔぇ ゔぉ",
    ],
  },
];

const smallKeys: Record<string, string> = {
  ぁ: "xa",
  ぃ: "xi",
  ぅ: "xu",
  ぇ: "xe",
  ぉ: "xo",
  ゃ: "xya",
  ゅ: "xyu",
  ょ: "xyo",
  っ: "xtu",
  ゎ: "xwa",
};
const aliases: Record<string, string[]> = {
  し: ["si"],
  ち: ["ti"],
  つ: ["tu"],
  ふ: ["hu"],
  じ: ["zi"],
  しゃ: ["sya"],
  しゅ: ["syu"],
  しょ: ["syo"],
  ちゃ: ["tya", "cya"],
  ちゅ: ["tyu", "cyu"],
  ちょ: ["tyo", "cyo"],
  じゃ: ["jya", "zya"],
  じゅ: ["jyu", "zyu"],
  じょ: ["jyo", "zyo"],
  ん: ["nn"],
  っ: ["xtsu", "ltu", "ltsu"],
};

export function convertInput(text: string, script: KanaScript): string {
  const roman = text.replace(/[a-z]+/gi, (run) =>
    script === "katakana" ? run.toUpperCase() : run.toLowerCase(),
  );
  return toKana(roman, {
    IMEMode: true,
    ...(script === "katakana" ? { customKanaMapping: { "n'": "ン" } } : {}),
  });
}

export function finalizeInput(text: string, script: KanaScript): string {
  return convertInput(text, script).replace(
    /[nN]$/,
    script === "katakana" ? "ン" : "ん",
  );
}

export function pendingRomaji(text: string): string {
  return text.match(/[a-z]+$/i)?.[0].toLowerCase() ?? "";
}

function hiragana(text: string): string {
  return toHiragana(text, { convertLongVowelMark: false });
}

function keysFor(text: string): string {
  const kana = hiragana(text);
  if (smallKeys[kana]) return smallKeys[kana];
  const keys = toRomaji(kana, {
    customRomajiMapping: {
      ん: "n'",
      ぢ: "di",
      づ: "du",
      ー: "-",
      ...smallKeys,
    },
  });
  // A leading sokuon belongs to the following syllable, not to an isolated key.
  if (kana.startsWith("っ") && kana.length > 1) {
    const rest = keysFor(text.slice(1));
    const doubled = rest.match(/^[bcdfghjklmpqrstvwxyz]/)?.[0];
    return doubled ? doubled + rest : "xtu" + rest;
  }
  return keys;
}

export function kanaCatalogue(script: KanaScript): KanaItem[] {
  return KANA_GROUPS.flatMap((group) =>
    group.rows.flatMap((row) =>
      row.split(" ").map((base) => {
        const kana = script === "katakana" ? toKatakana(base) : base;
        const keys = keysFor(base);
        const alternatives = [
          ...(aliases[base] ?? []),
          ...(smallKeys[base] && base !== "っ"
            ? [smallKeys[base].replace(/^x/, "l")]
            : []),
        ].filter((alias) => convertInput(alias, script) === kana);
        return { kana, keys, alternatives, group: group.id };
      }),
    ),
  );
}

export function inputCandidates(
  prefix: string,
  script: KanaScript,
): KanaItem[] {
  if (!prefix) return [];
  return kanaCatalogue(script)
    .filter((item) =>
      [item.keys, ...item.alternatives].some((keys) => keys.startsWith(prefix)),
    )
    .slice(0, 12);
}

export function inputChunks(text: string): InputChunk[] {
  const chunks: InputChunk[] = [];
  let index = 0;
  while (index < text.length) {
    const start = index;
    while (/[っッ]/.test(text[index] ?? "")) index++;
    if (index < text.length) index++;
    while (/[ゃゅょぁぃぅぇぉゎャュョァィゥェォヮー]/.test(text[index] ?? ""))
      index++;
    const value = text.slice(start, index);
    const isKana = /^[\u3041-\u3096\u30a1-\u30faー]+$/.test(value);
    const keys = isKana ? keysFor(value) : "";
    chunks.push({ text: value, keys, start, end: index });
  }
  return chunks;
}

export function rulesFor(text: string): InputRule[] {
  const kana = hiragana(text);
  const rules: InputRule[] = [];
  if (kana.includes("っ"))
    rules.push({
      id: "sokuon",
      title: "促音 っ",
      explanation:
        "双写后一个音的首个辅音，例如 issho → いっしょ。单独的小っ可输入 xtu。",
    });
  if (/[ゃゅょ]/.test(kana))
    rules.push({
      id: "combined",
      title: "拗音",
      explanation: "大假名和小ゃ／ゅ／ょ一起输入：sho → しょ，kyo → きょ。",
    });
  if (kana.includes("ー"))
    rules.push({
      id: "long",
      title: "长音 ー",
      explanation: "长音符号使用减号 -：片假名模式下 pa- → パー。",
    });
  if (kana.includes("ん"))
    rules.push({
      id: "n",
      title: "拨音 ん",
      explanation:
        "用 n' 明确结束这个音，例如 kin'youbi → きんようび；单独输入 nn 也可得到ん。",
    });
  if (/[ぁぃぅぇぉゎ]/.test(kana))
    rules.push({
      id: "small",
      title: "小假名",
      explanation:
        "单独的小假名可以用 x 开头，例如 xa → ぁ、xyu → ゅ；组合音可一起输入。",
    });
  if (/[はへを]/.test(kana))
    rules.push({
      id: "particle",
      title: "按键与读音",
      explanation:
        "按字形输入：は用 ha、へ用 he、を用 wo。作为助词时的读音可能不同。",
    });
  if (/[ぢづ]/.test(kana))
    rules.push({
      id: "d",
      title: "ぢ / づ",
      explanation: "ぢ输入 di，づ输入 du；与じ（ji）、ず（zu）区分。",
    });
  return rules;
}

export function missedChunks(
  expected: string,
  tokenKinds: string[],
): InputChunk[] {
  return inputChunks(expected).filter(
    (chunk) =>
      chunk.keys &&
      tokenKinds.slice(chunk.start, chunk.end).some((kind) => kind !== "match"),
  );
}
