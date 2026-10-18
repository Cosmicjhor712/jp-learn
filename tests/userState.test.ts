import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  isUserStateName,
  readUserState,
  userStatePath,
  writeUserState,
} from "../server/userState.ts";

function temporaryDirectory(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "jp-learn-user-state-"));
}

test("user state only accepts the allowlisted scenario and input files", () => {
  for (const name of [
    "scenarios",
    "input-learning",
    "../progress",
    "progress",
    "scenarios/..",
    "",
  ]) {
    assert.equal(
      isUserStateName(name),
      name === "scenarios" || name === "input-learning",
      name,
    );
  }
});

test("missing files read as null and writes round-trip as formatted JSON", () => {
  const dir = temporaryDirectory();
  try {
    assert.equal(readUserState(dir, "scenarios"), null);

    const library = {
      version: 2,
      selectedId: "dinner-invitation-v1",
      courses: {},
      attempts: [],
      focus: null,
      revisit: null,
      exposures: [],
    };
    writeUserState(dir, "scenarios", library);

    assert.equal(
      userStatePath(dir, "scenarios"),
      path.join(dir, "scenarios.json"),
    );
    assert.deepEqual(JSON.parse(readUserState(dir, "scenarios")!), library);
    assert.match(readUserState(dir, "scenarios")!, /\n {2}"version": 2,/);
    assert.deepEqual(fs.readdirSync(dir), ["scenarios.json"]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("input learning state is stored separately from scenarios", () => {
  const dir = temporaryDirectory();
  try {
    writeUserState(dir, "scenarios", { version: 2, courses: {} });
    writeUserState(dir, "input-learning", {
      version: 1,
      preferences: { mode: "romaji" },
      history: { あ: { kana: "あ", attempts: 1 } },
    });

    assert.deepEqual(JSON.parse(readUserState(dir, "scenarios")!), {
      version: 2,
      courses: {},
    });
    assert.deepEqual(JSON.parse(readUserState(dir, "input-learning")!), {
      version: 1,
      preferences: { mode: "romaji" },
      history: { あ: { kana: "あ", attempts: 1 } },
    });
    assert.deepEqual(fs.readdirSync(dir).sort(), [
      "input-learning.json",
      "scenarios.json",
    ]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
