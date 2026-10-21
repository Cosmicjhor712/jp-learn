import { test, expect, type Page } from "@playwright/test";
import { defaultSelection, type AudioVariant } from "../shared/tts.ts";
import { getScenario, scenarioCourses } from "../web/scenario/catalogue.ts";
import { plainJapanese } from "../web/scenario/content.ts";
import { LIBRARY_STORAGE_KEY } from "../web/scenario/library.ts";

const qwen = defaultSelection("bailian");
const cosy = defaultSelection("bailian", "cosyvoice-v3-flash");
const variants: AudioVariant[] = [
  {
    ...qwen,
    id: "a".repeat(64),
    format: "wav",
    sampleRate: 24000,
    generatedAt: "2026-10-20T00:00:00Z",
  },
  {
    ...cosy,
    id: "b".repeat(64),
    format: "wav",
    sampleRate: 24000,
    generatedAt: "2026-10-21T00:00:00Z",
  },
];
const status = {
  configured: false,
  voice: defaultSelection("volc").voice,
  providers: { volc: { configured: false }, bailian: { configured: false } },
  workspaceConfigured: false,
  defaultSelection: defaultSelection(),
};

test.beforeEach(async ({ page }) => {
  await page.route("**/api/progress", (route) =>
    route.fulfill({ json: { completedLessons: [], entries: {} } }),
  );
  await page.route("**/api/state/**", (route) =>
    route.fulfill({
      json: route.request().method() === "GET" ? null : { ok: true },
    }),
  );
  await page.route("**/api/tts**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/tts/status") return route.fulfill({ json: status });
    if (path === "/api/tts/variants")
      return route.fulfill({ json: { variants } });
    return route.fulfill({
      contentType: "audio/wav",
      body: Buffer.from("fixture-audio"),
    });
  });
  await page.addInitScript(() => {
    // Deterministic playback, without real speakers or cloud synthesis.
    Object.defineProperty(window, "Audio", {
      value: class {
        onended: (() => void) | null = null;
        onerror: (() => void) | null = null;
        timer?: ReturnType<typeof setTimeout>;
        play() {
          document.body.dataset.ttsPlaying = "1";
          if (!document.body.dataset.ttsHold)
            this.timer = setTimeout(() => this.onended?.(), 300);
          return Promise.resolve();
        }
        pause() {
          clearTimeout(this.timer);
          delete document.body.dataset.ttsPlaying;
        }
        removeAttribute() {}
      },
    });
  });
});
async function openLesson(page: Page) {
  await page.addInitScript(() =>
    sessionStorage.setItem("jp-learn-tts-skip", "1"),
  );
  await page.goto("/");
  await page
    .getByRole("button", {
      name: `进入情景课：${scenarioCourses[0].title}`,
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "录音版本", exact: true }).click();
  return page.getByRole("dialog", { name: "录音版本", exact: true });
}

test("startup selects provider/model/voice and remembers preferences but isolates session keys", async ({
  page,
}) => {
  let requests = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/tts") requests++;
  });
  await page.goto("/");
  const dialog = page.getByRole("dialog", { name: "语音设置" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("供应商").selectOption("bailian");
  await expect(dialog.getByLabel("模型")).toHaveValue("qwen3-tts-flash");
  await expect(dialog.getByLabel("音色")).toHaveValue("Ono Anna");
  await dialog.getByLabel("模型").selectOption("cosyvoice-v3-flash");
  await expect(dialog.getByLabel("音色")).toHaveValue("loongyuuna_v3");
  await dialog.getByLabel("API Key").fill("bailian-test-only");
  await dialog
    .getByLabel("北京业务空间 ID", { exact: true })
    .fill("llm-example");
  await dialog.getByLabel("音色").selectOption("loongyuuma_v3");
  await dialog.getByRole("button", { name: "保存配置" }).click();
  await expect(dialog).toBeHidden();
  expect(requests).toBe(0);
  const storage = await page.evaluate(() => ({
    local: JSON.stringify(localStorage),
    bailian: sessionStorage.getItem("jp-learn-bailian-api-key"),
    volc: sessionStorage.getItem("jp-learn-volc-api-key"),
  }));
  expect(storage.local).not.toContain("bailian-test-only");
  expect(storage.bailian).toBe("bailian-test-only");
  expect(storage.volc).toBeNull();
  await page.reload();
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "语音设置", exact: true }).click();
  await expect(dialog.getByLabel("音色")).toHaveValue("loongyuuma_v3");
  await dialog.getByLabel("供应商").selectOption("volc");
  await expect(dialog.getByLabel("API Key")).toHaveValue("");
  await dialog.getByRole("button", { name: "关闭", exact: true }).click();
});

test("the header reopens settings after skipping startup, including on the progress page", async ({
  page,
}) => {
  let generated = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/tts") generated++;
  });
  await page.goto("/");
  const settings = page.getByRole("dialog", { name: "语音设置" });
  await expect(settings).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(settings).toBeHidden();
  const header = page.getByRole("banner");
  const entry = header.getByRole("button", { name: "语音设置", exact: true });
  await expect(entry).toBeInViewport();
  await entry.focus();
  await page.keyboard.press("Enter");
  await expect(settings).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(entry).toBeFocused();
  await header.getByRole("button", { name: "查看进度" }).click();
  await entry.click();
  await expect(settings).toBeVisible();
  await settings.getByLabel("供应商").selectOption("bailian");
  await settings.getByRole("button", { name: "保存配置" }).click();
  await expect(settings).toBeHidden();
  await expect(
    header.getByRole("button", { name: "返回主界面" }),
  ).toBeVisible();
  expect(generated).toBe(0);
});

test("header settings stop playback, preserve lesson answers and use the new model on the next play", async ({
  page,
}) => {
  const calls: { selection: typeof qwen }[] = [];
  await page.route("**/api/tts", (route) => {
    calls.push(route.request().postDataJSON());
    return route.fulfill({ contentType: "audio/wav", body: "test" });
  });
  await page.goto("/");
  const settings = page.getByRole("dialog", { name: "语音设置" });
  await settings.getByLabel("供应商").selectOption("bailian");
  await settings.getByRole("button", { name: "保存配置" }).click();
  const course = scenarioCourses[0];
  await page
    .getByRole("button", { name: `进入情景课：${course.title}`, exact: true })
    .click();
  await page.getByLabel("日文原文", { exact: true }).check();
  const question = course.listeningQuestions[0];
  const answer = page
    .getByRole("group", { name: new RegExp(question.prompt) })
    .getByRole("button")
    .nth(question.correct);
  await answer.click();
  await expect(answer).toHaveAttribute("aria-pressed", "true");
  const before = await page.evaluate(
    (key) => localStorage.getItem(key),
    LIBRARY_STORAGE_KEY,
  );
  await page.evaluate(() => {
    document.body.dataset.ttsHold = "1";
  });
  await page.getByRole("button", { name: "播放对话", exact: true }).click();
  await expect(page.locator("body")).toHaveAttribute("data-tts-playing", "1");
  const entry = page
    .getByRole("banner")
    .getByRole("button", { name: "语音设置" });
  await entry.click();
  await expect(settings).toBeVisible();
  await expect(page.locator("body")).not.toHaveAttribute("data-tts-playing");
  await settings.getByLabel("模型").selectOption("cosyvoice-v3-flash");
  await settings.getByRole("button", { name: "保存配置" }).click();
  await expect(settings).toBeHidden();
  await expect(entry).toBeFocused();
  await expect(answer).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("日文原文", { exact: true })).toBeChecked();
  await expect(
    page.getByRole("button", { name: "停止播放", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), LIBRARY_STORAGE_KEY),
  ).toBe(before);
  expect(calls).toHaveLength(1);
  expect(calls[0].selection).toEqual(qwen);
  await page.getByRole("button", { name: "播放对话", exact: true }).click();
  await expect.poll(() => calls.length).toBe(2);
  expect(calls[1].selection).toEqual(cosy);
  await entry.click();
  await page.keyboard.press("Escape");
});

test("Qwen preview sends only the selected provider credentials and never auto-previews", async ({
  page,
}) => {
  const calls: { body: unknown; headers: Record<string, string> }[] = [];
  await page.route("**/api/tts", (route) => {
    calls.push({
      body: route.request().postDataJSON(),
      headers: route.request().headers(),
    });
    return route.fulfill({ contentType: "audio/wav", body: "test" });
  });
  await page.goto("/");
  const dialog = page.getByRole("dialog", { name: "语音设置" });
  await dialog.getByLabel("供应商").selectOption("bailian");
  await dialog.getByLabel("API Key").fill("only-bailian");
  expect(calls).toHaveLength(0);
  await dialog
    .getByRole("button", { name: "试听样句（无缓存时计费）" })
    .click();
  await expect.poll(() => calls.length).toBe(1);
  expect(calls[0].body).toEqual({
    text: "こんにちは。よろしくお願いします。",
    selection: qwen,
  });
  expect(calls[0].headers["x-bailian-api-key"]).toBe("only-bailian");
  expect(calls[0].headers["x-volc-api-key"]).toBeUndefined();
  await dialog.getByRole("button", { name: "关闭", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("versions can be auditioned without keys, chosen per sentence and reset independently", async ({
  page,
}) => {
  const fetched: string[] = [];
  let generated = 0;
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/api/tts/audio")
      fetched.push(url.searchParams.get("id")!);
    if (url.pathname === "/api/tts") generated++;
  });
  const dialog = await openLesson(page);
  await expect(dialog.getByRole("status")).toContainText("2 个已缓存版本");
  await expect(dialog).toContainText("Qwen3-TTS-Flash");
  await expect(dialog).toContainText("CosyVoice-v3-Flash");
  const rows = dialog.locator("li");
  await rows.nth(0).getByRole("button", { name: "试听", exact: true }).click();
  await rows.nth(1).getByRole("button", { name: "试听", exact: true }).click();
  await expect.poll(() => fetched.length).toBe(2);
  expect(fetched).toEqual(variants.map((variant) => variant.id));
  await rows
    .nth(1)
    .getByRole("button", { name: "本句使用", exact: true })
    .click();
  await expect(
    rows.nth(1).getByRole("button", { name: "本句已选" }),
  ).toHaveAttribute("aria-pressed", "true");
  await dialog.getByLabel("发言", { exact: true }).selectOption("1");
  await expect(dialog.getByRole("button", { name: "本句已选" })).toHaveCount(0);
  await dialog.getByLabel("发言", { exact: true }).selectOption("0");
  await expect(dialog.getByRole("button", { name: "本句已选" })).toHaveCount(1);
  expect(generated).toBe(0);
  const firstLine = plainJapanese(
    getScenario(scenarioCourses[0].id).dialogue[0].line,
  );
  await expect(dialog.getByText(firstLine, { exact: true })).toHaveCount(0);
  await dialog.getByRole("button", { name: "关闭", exact: true }).click();
  await page.getByRole("button", { name: "播放对话", exact: true }).click();
  await expect.poll(() => fetched.length).toBe(3);
  expect(fetched[2]).toBe(variants[1].id);
  await page.getByRole("button", { name: "录音版本", exact: true }).click();
  await dialog.getByRole("button", { name: "本句恢复默认配置" }).click();
  await expect(dialog.getByRole("button", { name: "本句已选" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole("button", { name: "录音版本", exact: true }),
  ).toBeFocused();
});

test("provider settings can be changed in-place without leaving a lesson or altering its selected recording", async ({
  page,
}) => {
  const picker = await openLesson(page);
  await picker
    .getByRole("button", { name: "本句使用", exact: true })
    .first()
    .click();
  await picker.getByRole("button", { name: "语音设置", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "语音设置", exact: true });
  await settings.getByLabel("供应商").selectOption("bailian");
  await settings.getByRole("button", { name: "保存配置" }).click();
  await expect(settings).toBeHidden();
  await expect(picker.locator("footer")).toContainText("Qwen3-TTS-Flash");
  await expect(picker.getByRole("button", { name: "本句已选" })).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(picker).toBeHidden();
});

test("stale cached recording reports an error without generation or fallback", async ({
  page,
}) => {
  let generated = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/tts") generated++;
  });
  await page.route("**/api/tts/audio?**", (route) =>
    route.fulfill({
      status: 404,
      json: { message: "这份录音已不存在；未自动生成或扣费" },
    }),
  );
  const dialog = await openLesson(page);
  await dialog
    .getByRole("button", { name: "试听", exact: true })
    .first()
    .click();
  await expect(dialog.getByRole("alert")).toContainText("未自动生成或扣费");
  expect(generated).toBe(0);
});

test("generation requires explicit confirmation and failure remains visible", async ({
  page,
}) => {
  await page.addInitScript((selection) => {
    localStorage.setItem(
      "jp-learn-tts-selection-v1",
      JSON.stringify(selection),
    );
    sessionStorage.setItem("jp-learn-tts-confirmed", "1");
    sessionStorage.setItem("jp-learn-bailian-api-key", "test-key");
  }, qwen);
  let generated = 0;
  await page.route("**/api/tts", (route) => {
    generated++;
    return route.fulfill({ status: 503, json: { message: "测试：额度不足" } });
  });
  await page.goto("/");
  await page
    .getByRole("button", {
      name: `进入情景课：${scenarioCourses[0].title}`,
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "录音版本", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "录音版本" });
  page.once("dialog", (confirmation) => confirmation.dismiss());
  await dialog.getByRole("button", { name: "生成当前配置版本" }).click();
  expect(generated).toBe(0);
  page.once("dialog", (confirmation) => confirmation.accept());
  await dialog.getByRole("button", { name: "生成当前配置版本" }).click();
  await expect(dialog.getByRole("alert")).toContainText("额度不足");
  await page.waitForTimeout(400);
  await expect(dialog.getByRole("alert")).toContainText("额度不足");
  expect(generated).toBe(1);
});

for (const width of [1440, 390, 320]) {
  test(`voice settings and version list fit ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const settings = page.getByRole("dialog", { name: "语音设置" });
    await settings.getByLabel("供应商").selectOption("bailian");
    await settings.getByLabel("模型").selectOption("cosyvoice-v3-flash");
    await page.screenshot({ path: `test-results/tts-settings-${width}.png` });
    expect(
      await settings.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    await settings.getByRole("button", { name: "关闭", exact: true }).click();
    const header = page.getByRole("banner");
    const entry = header.getByRole("button", { name: "语音设置", exact: true });
    await expect(entry).toBeInViewport();
    await page.screenshot({ path: `test-results/tts-home-header-${width}.png` });
    await page
      .getByRole("button", {
        name: `进入情景课：${scenarioCourses[0].title}`,
        exact: true,
      })
      .click();
    await expect(entry).toBeInViewport();
    await expect(
      header.getByRole("button", { name: "返回主界面" }),
    ).toBeInViewport();
    const controlsFit = await header.evaluate((element) => {
      const controls = Array.from(
        element.querySelectorAll("strong, .topbar-stats, button"),
      );
      const bounds = controls.map((control) => control.getBoundingClientRect());
      return bounds.every(
        (box, index) =>
          box.left >= 0 && box.right <= innerWidth &&
          bounds.slice(index + 1).every(
            (other) =>
              box.right <= other.left || box.left >= other.right ||
              box.bottom <= other.top || box.top >= other.bottom,
          ),
      );
    });
    expect(controlsFit).toBe(true);
    await page.screenshot({ path: `test-results/tts-lesson-header-${width}.png` });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(entry).toBeInViewport();
    await entry.click();
    await expect(settings).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "录音版本", exact: true }).click();
    const picker = page.getByRole("dialog", { name: "录音版本" });
    await expect(picker.locator("li")).toHaveCount(2);
    await page.screenshot({ path: `test-results/tts-versions-${width}.png` });
    expect(
      await picker.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}
