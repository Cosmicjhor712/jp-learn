import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { toHiragana } from "wanakana";
import {
  convertInput,
  finalizeInput,
  inputCandidates,
  inputChunks,
  kanaCatalogue,
  rulesFor,
  type KanaScript,
} from "../src/kana.ts";
import { diffTokens, normalize } from "../src/exercises.ts";
import { missedChunks } from "../src/kana.ts";
import type { Lesson } from "../src/types.ts";

function typeKeys(keys: string, script: KanaScript, initial = ""): string {
  return [...keys].reduce(
    (text, key) => convertInput(text + key, script),
    initial,
  );
}

test("typing and pasting agree on sokuon, yoon, long vowels, and ambiguous n", () => {
  const cases: [string, string, KanaScript][] = [
    ["isshoni", "いっしょに", "hiragana"],
    ["depa-to", "デパート", "katakana"],
    ["pa-thi-", "パーティー", "katakana"],
    ["kin'youbi", "きんようび", "hiragana"],
    ["n'a", "んあ", "hiragana"],
    ["n'a", "ンア", "katakana"],
    ["gakkou", "がっこう", "hiragana"],
    ["shi", "し", "hiragana"],
    ["si", "し", "hiragana"],
    ["sho", "しょ", "hiragana"],
    ["syo", "しょ", "hiragana"],
    ["wo", "を", "hiragana"],
    ["di", "ぢ", "hiragana"],
    ["du", "づ", "hiragana"],
    ["xtu", "っ", "hiragana"],
    ["ltsu", "っ", "hiragana"],
  ];
  for (const [keys, kana, script] of cases) {
    assert.equal(convertInput(keys, script), kana, keys);
    assert.equal(typeKeys(keys, script), kana, keys);
  }
});

test("unfinished input stays pending, final n settles once, script changes preserve existing kana", () => {
  assert.equal(convertInput("sh", "hiragana"), "sh");
  assert.equal(convertInput("n", "hiragana"), "n");
  assert.equal(finalizeInput("にほn", "hiragana"), "にほん");
  assert.equal(finalizeInput("パソコN", "katakana"), "パソコン");
  const mixed = typeKeys("depa-to", "katakana", "わたしは");
  assert.equal(
    typeKeys("niikimasu", "hiragana", mixed),
    "わたしはデパートにいきます",
  );
  assert.equal(convertInput("デパートへ", "hiragana"), "デパートへ");
  assert.equal(convertInput("わたしは", "katakana"), "わたしは");
});

test("every catalogue key sequence and alias produces its displayed kana", () => {
  for (const script of ["hiragana", "katakana"] as const) {
    for (const item of kanaCatalogue(script)) {
      for (const keys of [item.keys, ...item.alternatives]) {
        assert.equal(
          convertInput(keys, script),
          item.kana,
          `${item.kana}: ${keys}`,
        );
        assert.equal(
          typeKeys(keys, script),
          item.kana,
          `${item.kana}: ${keys}`,
        );
      }
    }
  }
});

test("all 405 course answers have round-trip-safe chunk annotations", () => {
  const lessons = JSON.parse(
    fs.readFileSync(new URL("../data/lessons.json", import.meta.url), "utf8"),
  ) as Lesson[];
  for (const text of lessons
    .flatMap((lesson) => [...lesson.vocabulary, ...lesson.sentences])
    .map((item) => item.japanese)) {
    const chunks = inputChunks(text);
    assert.equal(chunks.map((chunk) => chunk.text).join(""), text);
    for (const chunk of chunks) {
      if (!chunk.keys) continue;
      const script = /[ァ-ヶ]/.test(chunk.text) ? "katakana" : "hiragana";
      assert.equal(
        typeKeys(chunk.keys, script),
        chunk.text,
        `${text}: ${chunk.keys}`,
      );
    }
    const keys = chunks.map((chunk) => chunk.keys || chunk.text).join("");
    assert.equal(
      convertInput(keys, "hiragana"),
      toHiragana(text, { convertLongVowelMark: false }),
      text,
    );
  }
});

test("annotations preserve syllable groups and errors ignore inserted diff placeholders", () => {
  assert.deepEqual(
    inputChunks("いっしょに").map((item) => [item.text, item.keys]),
    [
      ["い", "i"],
      ["っしょ", "ssho"],
      ["に", "ni"],
    ],
  );
  assert.deepEqual(
    inputChunks("デパート").map((item) => [item.text, item.keys]),
    [
      ["デ", "de"],
      ["パー", "pa-"],
      ["ト", "to"],
    ],
  );
  const diff = diffTokens("あいしょに", "いっしょに");
  const kinds = diff.expectedTokens
    .filter((token) => token.kind !== "insert")
    .map((token) => token.kind);
  assert.deepEqual(
    missedChunks(normalize("いっしょに"), kinds).map((chunk) => chunk.text),
    ["っしょ"],
  );
  assert.ok(rulesFor("っしょ").some((rule) => rule.id === "sokuon"));
  assert.ok(rulesFor("を").some((rule) => rule.id === "particle"));
  assert.deepEqual(
    inputCandidates("sh", "hiragana")
      .map((item) => item.kana)
      .slice(0, 4),
    ["し", "しゃ", "しゅ", "しょ"],
  );
});
