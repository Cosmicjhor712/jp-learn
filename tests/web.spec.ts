import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import { createSrsEntry, updateSrs } from "../src/srs.ts";
import type { Lesson, Progress } from "../src/types.ts";
import { kanaCatalogue } from "../src/kana.ts";

const lessons = JSON.parse(
  fs.readFileSync(new URL("../data/lessons.json", import.meta.url), "utf8"),
) as Lesson[];
const fixture: Progress = {
  completedLessons: lessons.map((lesson) => lesson.id),
  entries: Object.fromEntries(
    lessons.flatMap((lesson) => [
      ...lesson.vocabulary.map((word) => [
        word.id,
        createSrsEntry(word.id, "word"),
      ]),
      ...lesson.sentences.map((sentence) => [
        sentence.id,
        createSrsEntry(sentence.id, "sentence"),
      ]),
    ]),
  ),
};

test.beforeEach(async ({ page }) => {
  // Never write to the user's real learning-progress endpoint during tests.
  await page.route("**/api/progress", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(fixture),
    }),
  );
});

async function openWordDrill(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: /学习新课/ }).click();
  await page
    .getByRole("button", { name: new RegExp(lessons[0].title) })
    .click();
  await page.getByRole("button", { name: /查看词汇表/ }).click();
  await page.getByRole("button", { name: /开始词汇练习/ }).click();
}

test("home recommends the first lesson without counting unseen content as due", async ({
  page,
}) => {
  const fresh = { ...fixture, completedLessons: [] };
  await page.route("**/api/progress", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(fresh),
    }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "今日学习", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("0 项待复习", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "下一课", exact: true }),
  ).toContainText(lessons[0].title);
  await page.getByRole("button", { name: "开始学习", exact: true }).click();
  await expect(page.getByText(lessons[0].title, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /查看词汇表/ })).toBeVisible();
});

test("home prioritizes available reviews and opens the next unfinished lesson directly", async ({
  page,
}) => {
  const progress = structuredClone(fixture);
  progress.completedLessons = [lessons[0].id];
  for (const entry of Object.values(progress.entries))
    entry.nextReview = "2099-01-01";
  progress.entries[lessons[0].vocabulary[0].id].nextReview = "2000-01-01";
  progress.entries[lessons[1].vocabulary[0].id].nextReview = "2000-01-01";
  progress.entries["lesson-1_removed"] = createSrsEntry(
    "lesson-1_removed",
    "word",
  );
  progress.entries[lessons[0].vocabulary[1].id].stability = 21;
  await page.route("**/api/progress", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(progress),
    }),
  );
  await page.goto("/");
  await expect(page.getByLabel("1 项待复习", { exact: true })).toBeVisible();
  await expect(
    page.getByLabel("已完成 1 / 15 课", { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "今日任务", exact: true })
      .getByRole("button", { name: "开始复习", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "下一课", exact: true }),
  ).toContainText(lessons[1].title);
  await page
    .getByRole("button", { name: `开始学习：${lessons[1].title}`, exact: true })
    .click();
  await expect(page.getByText(lessons[1].title, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /查看词汇表/ })).toBeVisible();
  await page.getByRole("button", { name: "返回主界面", exact: true }).click();
  await page.getByRole("button", { name: "开始复习", exact: true }).click();
  await expect(page.locator(".prompt")).toHaveText(
    lessons[0].vocabulary[0].english,
  );
  await expect(page.getByText("1/1", { exact: true })).toBeVisible();
});

test("home handles a fully completed course with no due reviews", async ({
  page,
}) => {
  const progress = structuredClone(fixture);
  for (const entry of Object.values(progress.entries))
    entry.nextReview = "2099-01-01";
  await page.route("**/api/progress", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(progress),
    }),
  );
  await page.goto("/");
  await expect(page.getByLabel("0 项待复习", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "课程进度", exact: true }),
  ).toContainText("全部课程已完成");
  await expect(
    page.getByRole("region", { name: "下一课", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "练习假名", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "开始练习", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "返回主界面", exact: true }).click();
  await page.getByRole("button", { name: "查看进度", exact: true }).click();
  await expect(page.getByText("学习进度", { exact: true })).toBeVisible();
});

for (const width of [1440, 390, 320]) {
  test(`home layout and all actions fit at ${width}px`, async ({ page }) => {
    const progress = structuredClone(fixture);
    progress.completedLessons = [lessons[0].id, lessons[1].id];
    for (const entry of Object.values(progress.entries))
      entry.nextReview = "2099-01-01";
    for (const word of lessons[0].vocabulary.slice(0, 8))
      progress.entries[word.id].nextReview = "2000-01-01";
    for (const word of lessons[1].vocabulary.slice(0, 5))
      progress.entries[word.id].stability = 21;
    await page.route("**/api/progress", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(progress),
      }),
    );
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 950 });
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "今日学习", exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("8 项待复习", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "开始复习", exact: true }),
    ).toBeInViewport();
    await expect(
      page.getByRole("region", { name: "下一课", exact: true }),
    ).toBeInViewport();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      await page
        .locator(".learning-home button")
        .evaluateAll((buttons) =>
          buttons.every(
            (button) =>
              button.scrollWidth <= button.clientWidth &&
              button.scrollHeight <= button.clientHeight,
          ),
        ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/home-${width}.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: /假名输入练习/ }).click();
    await expect(
      page.getByRole("button", { name: "开始练习", exact: true }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test("returning home preserves saved reviews without grading the unfinished question", async ({
  page,
}) => {
  const [first, second] = lessons[0].vocabulary;
  let saved: Progress = structuredClone(fixture);
  for (const entry of Object.values(saved.entries))
    entry.nextReview = "2099-01-01";
  saved.entries[first.id].nextReview = "2000-01-01";
  saved.entries[second.id].nextReview = "2000-01-01";
  const unfinished = structuredClone(saved.entries[second.id]);
  await page.route("**/api/progress", (route) => {
    if (route.request().method() === "PUT")
      saved = route.request().postDataJSON() as Progress;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(saved),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: /开始复习/ }).click();
  await expect(page.locator(".prompt")).toHaveText(first.english);
  await page.getByRole("textbox", { name: "日语答案" }).fill(first.japanese);
  await page.getByRole("button", { name: "提交", exact: true }).click();
  const savedReview = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/progress") &&
      response.request().method() === "PUT",
  );
  await page.getByRole("button", { name: "下一题", exact: true }).click();
  await savedReview;
  await expect(page.locator(".prompt")).toHaveText(second.english);
  expect(saved.entries[first.id].repetitions).toBe(1);
  const completed = structuredClone(saved.entries[first.id]);
  await page.getByRole("textbox", { name: "日语答案" }).pressSequentially("a");
  await page.getByRole("button", { name: "返回主界面", exact: true }).click();
  await expect(page.getByRole("button", { name: /学习新课/ })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "返回主界面", exact: true }),
  ).toHaveCount(0);

  await page.reload();
  await page.getByRole("button", { name: /开始复习/ }).click();
  await expect(page.locator(".prompt")).toHaveText(second.english);
  expect(saved.entries[first.id]).toEqual(completed);
  expect(saved.entries[second.id]).toEqual(unfinished);
});

test("the home button works by keyboard after a listening answer and stops playback", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "speechSynthesis", {
      value: {
        speaking: false,
        getVoices: () => [],
        speak() {
          this.speaking = true;
        },
        cancel() {
          this.speaking = false;
        },
      },
    });
  });
  let saved: Progress = structuredClone(fixture);
  await page.route("**/api/progress", (route) => {
    if (route.request().method() === "PUT")
      saved = route.request().postDataJSON() as Progress;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(saved),
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: /听力练习/ }).click();
  await page.getByRole("button", { name: /理解选择/ }).click();
  await page
    .getByRole("button", { name: new RegExp(lessons[0].title) })
    .click();
  await expect
    .poll(() => page.evaluate(() => speechSynthesis.speaking))
    .toBe(true);
  await page.getByRole("button", { name: /开始作答/ }).click();
  await page.locator(".choices button").first().click();
  if (!(await page.locator(".result-ok").isVisible()))
    await page.locator(".choices button").nth(1).click();
  await expect(
    page.getByRole("button", { name: "下一题", exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "返回主界面", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: /学习新课/ })).toBeVisible();
  expect(await page.evaluate(() => speechSynthesis.speaking)).toBe(false);
  expect(saved).toEqual(fixture);
});

for (const mode of [
  "word",
  "sentence",
  "dictation",
  "choice",
  "kana",
] as const) {
  test(`return home is available during ${mode} practice`, async ({ page }) => {
    if (mode === "word" || mode === "sentence") {
      await openWordDrill(page);
      if (mode === "sentence") {
        for (let index = 0; index < lessons[0].vocabulary.length; index++) {
          await page.getByRole("button", { name: "跳过", exact: true }).click();
          await page
            .getByRole("button", { name: "下一题", exact: true })
            .click();
        }
        await expect(page.getByText("整句翻译", { exact: true })).toBeVisible();
      }
    } else {
      await page.goto("/");
      if (mode === "kana") {
        await page.getByRole("button", { name: /假名输入练习/ }).click();
        await page
          .getByRole("button", { name: "开始练习", exact: true })
          .click();
      } else {
        await page.getByRole("button", { name: /听力练习/ }).click();
        await page
          .getByRole("button", {
            name: mode === "dictation" ? /听写模式/ : /理解选择/,
          })
          .click();
        await page
          .getByRole("button", { name: new RegExp(lessons[0].title) })
          .click();
      }
    }
    const home = page.getByRole("button", { name: "返回主界面", exact: true });
    await expect(home).toBeInViewport();
    await home.click();
    await expect(page.getByRole("button", { name: /学习新课/ })).toBeVisible();
    await expect(home).toHaveCount(0);
  });
}

test("built-in romaji, script switching, cursor insertion, replacement, and backspace", async ({
  page,
}) => {
  await openWordDrill(page);
  const input = page.getByRole("textbox", { name: "日语答案" });
  await input.pressSequentially("isshoni");
  await expect(input).toHaveValue("いっしょに");
  await page.getByRole("button", { name: "片假名", exact: true }).click();
  await input.pressSequentially("depa-to");
  await expect(input).toHaveValue("いっしょにデパート");
  await page.getByRole("button", { name: "平假名", exact: true }).click();
  await input.press("Home");
  await input.pressSequentially("a");
  await expect(input).toHaveValue("あいっしょにデパート");
  await input.press("Backspace");
  await expect(input).toHaveValue("いっしょにデパート");
  await input.press("ControlOrMeta+A");
  await input.pressSequentially("kin'youbi");
  await expect(input).toHaveValue("きんようび");
  await input.fill("sh");
  await page.getByRole("button", { name: "提交", exact: true }).click();
  await expect(
    page.getByText("还有未完成的罗马字，请补全后提交。"),
  ).toBeVisible();
  await expect(page.locator(".answer-feedback")).toHaveCount(0);
});

test("wrong answers annotate grouped syllables and reveal rule explanations", async ({
  page,
}) => {
  await openWordDrill(page);
  await page.getByRole("textbox", { name: "日语答案" }).pressSequentially("a");
  await page.getByRole("button", { name: "提交", exact: true }).click();
  await expect(page.locator(".answer-feedback ruby")).not.toHaveCount(0);
  await page.getByRole("button", { name: "切换答案按键标注" }).click();
  await expect(page.locator(".answer-feedback rt")).toHaveCount(0);
  await page.getByRole("button", { name: "切换答案按键标注" }).click();
  await expect(page.locator(".answer-feedback rt")).not.toHaveCount(0);
  await page
    .getByRole("textbox", { name: "日语答案" })
    .fill(lessons[0].vocabulary[0].japanese);
  await page.getByRole("button", { name: "提交", exact: true }).click();
  await expect(page.getByText("答对了 · 辅助完成")).toBeVisible();
  await page.getByRole("button", { name: "下一题", exact: true }).click();
  await expect(
    page.getByText(`2/${lessons[0].vocabulary.length}`, { exact: true }),
  ).toBeVisible();
  const entry = await page.evaluate(
    (id) => JSON.parse(localStorage.getItem("jp-learn-progress")!).entries[id],
    lessons[0].vocabulary[0].id,
  );
  expect(entry.difficulty).toBe(
    updateSrs(fixture.entries[lessons[0].vocabulary[0].id], 2).difficulty,
  );
});

test("IME confirmation never submits, and native input preserves kana", async ({
  page,
}) => {
  await openWordDrill(page);
  const input = page.getByRole("textbox", { name: "日语答案" });
  await page.getByRole("button", { name: "系统输入法", exact: true }).click();
  await input.dispatchEvent("compositionstart", { data: "わ" });
  await input.fill(lessons[0].vocabulary[0].japanese);
  await input.dispatchEvent("keydown", {
    key: "Enter",
    code: "Enter",
    keyCode: 229,
    isComposing: true,
  });
  await expect(page.locator(".completion")).toHaveCount(0);
  await input.dispatchEvent("compositionend", {
    data: lessons[0].vocabulary[0].japanese,
  });
  await input.press("Enter");
  await expect(page.getByText("正解！", { exact: true })).toBeVisible();
});

test("assistant search and virtual keyboard insert at the active cursor", async ({
  page,
}) => {
  await openWordDrill(page);
  const input = page.getByRole("textbox", { name: "日语答案" });
  await input.pressSequentially("ai");
  await input.press("Home");
  await page.getByRole("button", { name: "按键 k", exact: true }).click();
  await page.getByRole("button", { name: "按键 a", exact: true }).click();
  await expect(input).toHaveValue("かあい");
  await page.getByRole("textbox", { name: "查找假名或罗马字" }).fill("sho");
  await page.getByRole("button", { name: "しょ sho", exact: true }).click();
  await expect(page.locator(".detail-keys")).toContainText("sho");
  await page.getByRole("button", { name: "插入 しょ", exact: true }).click();
  await expect(input).toHaveValue("かしょあい");
});

test("lookup keeps independent grading, while answer reveal is graded as assisted", async ({
  page,
}) => {
  await openWordDrill(page);
  await page.getByRole("button", { name: "し shi", exact: true }).click();
  await page.getByRole("button", { name: "使用按键 si", exact: true }).click();
  await expect(page.locator(".key-sequence")).toHaveAttribute(
    "aria-label",
    "按键顺序 si",
  );
  await page
    .getByRole("textbox", { name: "日语答案" })
    .fill(lessons[0].vocabulary[0].japanese);
  await page.getByRole("button", { name: "提交", exact: true }).click();
  await expect(page.getByText("正解！", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "下一题", exact: true }).click();
  await page.getByRole("button", { name: "查看答案", exact: true }).click();
  await page
    .getByRole("textbox", { name: "日语答案" })
    .fill(lessons[0].vocabulary[1].japanese);
  await page.getByRole("button", { name: "提交", exact: true }).click();
  await expect(page.getByText("答对了 · 辅助完成")).toBeVisible();
});

test("weak-point practice uses saved input history and preferences survive reload", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /假名输入练习/ }).click();
  await page.getByRole("button", { name: "易错项复练", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "开始练习", exact: true }),
  ).toBeDisabled();
  await page.evaluate(() => {
    localStorage.setItem(
      "jp-learn-kana-history-v1",
      JSON.stringify({
        っしょ: {
          kana: "っしょ",
          errors: 3,
          attempts: 1,
          successes: 0,
          assisted: 1,
        },
      }),
    );
    localStorage.setItem(
      "jp-learn-input-preferences-v1",
      JSON.stringify({
        mode: "romaji",
        script: "katakana",
        help: "manual",
        keyboard: false,
      }),
    );
  });
  await page.reload();
  await page.getByRole("button", { name: /假名输入练习/ }).click();
  await expect(page.getByLabel("练习假名类型")).toHaveValue("katakana");
  await page.getByRole("button", { name: "易错项复练", exact: true }).click();
  await page.getByRole("button", { name: "开始练习", exact: true }).click();
  await expect(page.locator(".prompt")).toHaveText("っしょ");
  await expect(page.locator(".virtual-keyboard")).toHaveCount(0);
  await expect(page.getByLabel("按键标注")).toHaveValue("manual");
});

test("practice records survive reload independently from vocabulary FSRS", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /假名输入练习/ }).click();
  await page.getByLabel("练习范围").selectOption("small");
  await page.getByRole("button", { name: "开始练习", exact: true }).click();
  const expected = (await page.locator(".prompt").textContent())!;
  const item = kanaCatalogue("hiragana").find(
    (kana) => kana.kana === expected,
  )!;
  await page
    .getByRole("textbox", { name: "日语答案" })
    .pressSequentially(item.keys);
  await page.getByRole("button", { name: "提交", exact: true }).click();
  await page.getByRole("button", { name: "下一题", exact: true }).click();
  const state = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("jp-learn-kana-history-v1")!),
  );
  expect(state[expected].successes).toBe(1);
  await page.reload();
  await page.getByRole("button", { name: /假名输入练习/ }).click();
  await expect(page.locator(".practice-summary")).toContainText(
    "累计练习 1 项",
  );
  await expect(page.locator(".practice-summary")).toContainText(
    "独立答对 1 项",
  );
});

test("listening uses ordinary p/s keys for typing and submits through the shared editor", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /听力练习/ }).click();
  await page.getByRole("button", { name: /听写模式/ }).click();
  await page
    .getByRole("button", { name: new RegExp(lessons[0].title) })
    .click();
  await page
    .getByRole("textbox", { name: "日语答案" })
    .pressSequentially("pasu");
  await expect(page.getByRole("textbox", { name: "日语答案" })).toHaveValue(
    "ぱす",
  );
});

for (const width of [1440, 390]) {
  test(`workspace is visible without horizontal overflow at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 950 });
    await openWordDrill(page);
    await expect(
      page.getByRole("button", { name: "返回主界面", exact: true }),
    ).toBeInViewport();
    await expect(page.getByRole("textbox", { name: "日语答案" })).toBeVisible();
    await expect(page.locator(".virtual-keyboard")).toBeVisible();
    if (width < 860)
      await page
        .getByRole("button", { name: "假名输入助手", exact: true })
        .click();
    await expect(page.locator(".kana-grid")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/workspace-${width}.png`,
      fullPage: true,
    });
    await page.evaluate(() =>
      window.scrollTo(0, document.documentElement.scrollHeight),
    );
    await expect(
      page.getByRole("button", { name: "返回主界面", exact: true }),
    ).toBeInViewport();
  });
}

for (const [text, wrong, width] of [
  ["いっしょに", "ishoni", 1440],
  ["デパート", "depato", 390],
] as const) {
  test(`review explains the input rule for ${text}`, async ({ page }) => {
    const word = lessons
      .flatMap((lesson) => lesson.vocabulary)
      .find((item) => item.japanese === text)!;
    const progress = structuredClone(fixture);
    for (const entry of Object.values(progress.entries))
      entry.nextReview = "2099-01-01";
    progress.entries[word.id] = createSrsEntry(word.id, "word");
    await page.route("**/api/progress", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(progress),
      }),
    );
    await page.setViewportSize({ width, height: 950 });
    await page.goto("/");
    await page.getByRole("button", { name: /开始复习/ }).click();
    if (text === "デパート")
      await page.getByRole("button", { name: "片假名", exact: true }).click();
    await page
      .getByRole("textbox", { name: "日语答案" })
      .pressSequentially(wrong);
    await page.getByRole("button", { name: "提交", exact: true }).click();
    const group = text === "デパート" ? "パー" : "っしょ";
    await expect(page.locator(".answer-feedback")).toContainText(
      text === "デパート" ? "长音 ー" : "促音 っ",
    );
    await page
      .getByRole("button", { name: `查看 ${group} 的输入方法`, exact: true })
      .click();
    await expect(page.locator(".kana-detail")).toBeVisible();
    await page.screenshot({
      path: `test-results/feedback-${width}.png`,
      fullPage: true,
    });
  });
}
