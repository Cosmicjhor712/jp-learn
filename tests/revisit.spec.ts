import { test, expect, type Page } from "@playwright/test";
import { getScenario, scenarioCourses } from "../web/scenario/catalogue.ts";
import { scenarioVariants } from "../web/scenario/variants.ts";
import {
  newScenarioProgress,
  answerMeaning,
} from "../web/scenario/progress.ts";
import {
  newLibrary,
  updateCourse,
  LIBRARY_STORAGE_KEY,
  startFocus,
  type LearningLibrary,
} from "../web/scenario/library.ts";
import { revisitPlans } from "../web/scenario/revisit.ts";

const now = Date.parse("2026-10-14T04:00:00Z");
const day = 86400000;
function learned(index = 0, at = now - 2 * day) {
  const course = scenarioCourses[index];
  let progress = {
    ...newScenarioProgress(1, course.id),
    heard: true,
    expressionsDone: true,
  };
  for (const q of [...course.listeningQuestions, ...course.readingQuestions])
    progress = answerMeaning(progress, q.id, q.correct);
  for (const p of [...course.responsePrompts, course.transferPrompt])
    progress.speaking[p.id] = {
      triedFirst: true,
      revealed: true,
      rating: "independent",
    };
  progress.stage = 5;
  progress.completedAt = new Date(at).toISOString();
  return updateCourse(newLibrary(), course.id, progress);
}
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      window.sessionStorage.setItem("jp-learn-tts-skip", "1");
    } catch {
      // ignore
    }
  });
  // Keep tests offline: never call the real Volcengine TTS (would consume quota).
  await page.route("**/api/tts**", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "not-configured" }),
    }),
  );
  await page.route("**/api/progress", (route) =>
    route.fulfill({ json: { completedLessons: [], entries: {} } }),
  );
  await page.route("**/api/state/**", (route) =>
    route.request().method() === "GET"
      ? route.fulfill({ json: null })
      : route.fulfill({ json: { ok: true } }),
  );
  await page.clock.setFixedTime(new Date(now));
  await page.addInitScript(() => {
    let generation = 0;
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      value: class {
        constructor(public text: string) {}
      },
    });
    Object.defineProperty(window.speechSynthesis, "getVoices", {
      configurable: true,
      value: () => [{ lang: "ja-JP", name: "Test Japanese", default: true }],
    });
    Object.defineProperty(window.speechSynthesis, "cancel", {
      configurable: true,
      value: () => {
        generation += 1;
      },
    });
    Object.defineProperty(window.speechSynthesis, "speak", {
      configurable: true,
      value: (utterance: SpeechSynthesisUtterance) => {
        const current = generation;
        setTimeout(() => {
          if (generation === current)
            utterance.onend?.(new Event("end") as SpeechSynthesisEvent);
        }, 5);
      },
    });
  });
});
async function seed(page: Page, library: LearningLibrary) {
  await page.addInitScript(
    ({ key, library }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(library));
    },
    { key: LIBRARY_STORAGE_KEY, library },
  );
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "今日学习", exact: true }),
  ).toBeVisible();
}
async function stored(page: Page): Promise<LearningLibrary> {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    LIBRARY_STORAGE_KEY,
  );
}
async function quiz(page: Page, id: string, skill: "listening" | "reading") {
  const course = getScenario(id);
  for (const question of skill === "listening"
    ? course.listeningQuestions
    : course.readingQuestions)
    await page
      .getByRole("group", { name: new RegExp(question.prompt) })
      .getByRole("button")
      .nth(question.correct)
      .click();
}
async function finishFromListening(page: Page, id: string, audio = true) {
  if (audio) {
    await page.getByRole("button", { name: "播放对话", exact: true }).click();
    await expect(
      page.getByText("对话已播放完毕", { exact: true }),
    ).toBeVisible();
  } else await page.getByLabel("日文原文", { exact: true }).check();
  await quiz(page, id, "listening");
  await page.getByRole("button", { name: "下一环节", exact: true }).click();
  for (let i = 0; i < 2; i++) {
    await page
      .getByRole("button", { name: "我已说完，查看参考", exact: true })
      .click();
    await page.getByRole("button", { name: "能独立表达", exact: true }).click();
    await page.getByRole("button", { name: "下一环节", exact: true }).click();
  }
  await quiz(page, id, "reading");
  await page.getByRole("button", { name: "完成变体练习", exact: true }).click();
}

for (const [index, variant] of scenarioVariants.entries()) {
  test(`revisit completes ${variant.title}, saves its version and never overwrites the original course`, async ({
    page,
  }) => {
    const library = learned(index);
    await seed(page, library);
    const section = page.getByRole("region", { name: "隔日再测", exact: true });
    await expect(section).toContainText("1 个情景到期");
    await expect(section).toContainText("首次练习");
    await section
      .getByRole("button", { name: "开始到期复测", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: variant.title, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "下一环节", exact: true }),
    ).toBeDisabled();
    await expect(
      page
        .getByRole("navigation", { name: "复测环节" })
        .getByRole("button", { name: /读懂新消息/ }),
    ).toBeDisabled();
    await finishFromListening(page, variant.id);
    await expect(page.getByText("变体练习回顾", { exact: true })).toBeVisible();
    await expect(page.locator(".revisit-result-context")).toContainText(
      "间隔 48 小时后的复测",
    );
    await expect(page.locator(".revisit-result-context")).toContainText(
      "间隔 3 天",
    );
    const saved = await stored(page);
    expect(saved.revisit).toBeNull();
    expect(saved.attempts).toHaveLength(2);
    expect(saved.attempts[1].revisit).toMatchObject({
      variantId: variant.id,
      baseId: variant.baseId,
      contentVersion: 1,
      mode: "delayed",
    });
    expect(saved.courses).toEqual(library.courses);
    expect(saved.attempts[0]).toEqual(library.attempts[0]);
    await page.getByRole("button", { name: "回到首页", exact: true }).click();
    await expect(
      page.getByRole("region", { name: "隔日再测", exact: true }),
    ).toContainText("暂无到期情景");
    await page.getByRole("button", { name: "查看进度", exact: true }).click();
    const radar = page.getByRole("region", { name: "练习雷达", exact: true });
    await radar.getByRole("button", { name: "隔日复测", exact: true }).click();
    await expect(radar).toContainText("1 次已完成练习");
    await expect(
      radar.getByRole("button", { name: "查看听力理解依据" }),
    ).toContainText("答对 2 / 2 题");
    await expect(
      radar.getByRole("button", { name: "查看迁移表达依据" }),
    ).toContainText("100%");
    await radar
      .getByRole("button", { name: "再练这组变体", exact: true })
      .click();
    expect((await stored(page)).revisit?.mode).toBe("practice");
  });
}

test("revisit resumes first answers and step after home and reload without losing aid history", async ({
  page,
}) => {
  await seed(page, learned());
  await page.getByRole("button", { name: "开始到期复测", exact: true }).click();
  await page.getByLabel("中文释义", { exact: true }).check();
  await quiz(page, scenarioVariants[0].id, "listening");
  await page.getByRole("button", { name: "下一环节", exact: true }).click();
  await page.getByRole("button", { name: "返回主界面", exact: true }).click();
  await page.reload();
  await page
    .getByRole("region", { name: "隔日再测", exact: true })
    .getByRole("button", { name: "继续变体练习", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "接一句话", exact: true }),
  ).toBeVisible();
  const saved = await stored(page);
  expect(saved.revisit?.step).toBe(1);
  expect(saved.revisit?.progress.supports.listening).toEqual([
    "transcript",
    "translation",
  ]);
  expect(
    saved.revisit?.progress.answers[
      scenarioVariants[0].listeningQuestions[0].id
    ].independent,
  ).toBe(false);
});

test("revisit early practice is accessible by keyboard but does not advance the delayed schedule", async ({
  page,
}) => {
  await seed(page, learned(0, now - day / 2));
  const section = page.getByRole("region", { name: "隔日再测", exact: true });
  await expect(section).toContainText("暂无到期情景");
  await section.locator("summary").click();
  await section
    .getByRole("button", {
      name: `练习变体：${scenarioCourses[0].title}`,
      exact: true,
    })
    .focus();
  await page.keyboard.press("Enter");
  await finishFromListening(page, scenarioVariants[0].id);
  await expect(page.locator(".revisit-result-context")).toContainText(
    "不计为到期复测",
  );
  const plans = revisitPlans(await stored(page), now);
  expect(plans[0].intervalDays).toBe(1);
  expect(plans[0].delayedRuns).toBe(0);
  await page.getByRole("button", { name: "回到首页", exact: true }).click();
  await page.getByRole("button", { name: "查看进度", exact: true }).click();
  await page.getByRole("button", { name: "隔日复测", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "查看听力理解依据" }),
  ).toContainText("待积累");
  await page.getByRole("button", { name: "全部变体", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "查看听力理解依据" }),
  ).toContainText("100%");
});

test("revisit text-only fallback remains usable but does not claim listening retention or extend the interval", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(window.speechSynthesis, "getVoices", {
      value: () => [],
    }),
  );
  await seed(page, learned());
  await page.getByRole("button", { name: "开始到期复测", exact: true }).click();
  await page.getByRole("button", { name: "播放对话", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("浏览器没有可用的日语音色");
  await finishFromListening(page, scenarioVariants[0].id, false);
  await expect(page.locator(".revisit-result-context")).toContainText(
    "间隔 1 天",
  );
  await page.getByRole("button", { name: "回到首页", exact: true }).click();
  await page.getByRole("button", { name: "查看进度", exact: true }).click();
  await page.getByRole("button", { name: "隔日复测", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "查看听力理解依据" }),
  ).toContainText("待积累");
  await expect(
    page.getByRole("button", { name: "查看阅读理解依据" }),
  ).toContainText("100%");
});

test("revisit respects a pending focused attempt and keeps it intact", async ({
  page,
}) => {
  const library = startFocus(learned(), {
    lessonId: scenarioCourses[1].id,
    skill: "reading",
  });
  await seed(page, library);
  const section = page.getByRole("region", { name: "隔日再测", exact: true });
  await section
    .getByRole("button", { name: "继续未完成单项练习", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "再读懂一条消息", exact: true }),
  ).toBeVisible();
  expect((await stored(page)).focus).toEqual(library.focus);
  expect((await stored(page)).revisit).toBeNull();
});

test("revisit invalidates delayed evidence after opening original answers mid-session", async ({
  page,
}) => {
  await seed(page, learned());
  await page.getByRole("button", { name: "开始到期复测", exact: true }).click();
  await page.getByRole("button", { name: "返回主界面", exact: true }).click();
  await page
    .getByRole("region", { name: "最近一次练习", exact: true })
    .getByRole("button", { name: "查看回顾", exact: true })
    .click();
  expect((await stored(page)).revisit?.mode).toBe("practice");
  await page.getByRole("button", { name: "回到首页", exact: true }).click();
  await page
    .getByRole("region", { name: "隔日再测", exact: true })
    .getByRole("button", { name: "继续变体练习", exact: true })
    .click();
  await finishFromListening(page, scenarioVariants[0].id);
  await expect(page.locator(".revisit-result-context")).toContainText(
    "不计为到期复测",
  );
  expect((await stored(page)).attempts[1].revisit?.mode).toBe("practice");
});

test("revisit due status refreshes after returning to the window", async ({
  page,
}) => {
  await seed(page, learned(0, now - day + 60000));
  const section = page.getByRole("region", { name: "隔日再测", exact: true });
  await expect(section).toContainText("暂无到期情景");
  await page.clock.setFixedTime(new Date(now + 60000));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    section.getByRole("button", { name: "开始到期复测", exact: true }),
  ).toBeVisible();
});

for (const width of [1440, 390, 320]) {
  test(`revisit home, versioned speech prompts and reading fit at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 950 });
    let library = learned();
    for (let index = 1; index < scenarioCourses.length; index++)
      library = {
        ...library,
        courses: {
          ...library.courses,
          ...Object.fromEntries([
            [
              scenarioCourses[index].id,
              learned(index).courses[scenarioCourses[index].id],
            ],
          ]),
        },
        attempts: [...library.attempts, ...learned(index).attempts],
      };
    await seed(page, library);
    await page
      .getByRole("region", { name: "隔日再测", exact: true })
      .locator("summary")
      .click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `test-results/revisit-home-${width}.png`,
      animations: "disabled",
    });
    await page
      .getByRole("button", {
        name: `练习变体：${scenarioCourses[11].title}`,
        exact: true,
      })
      .click();
    await page.getByLabel("日文原文", { exact: true }).check();
    await page.getByLabel("假名注音", { exact: true }).check();
    expect(
      await page
        .locator(".revisit-steps")
        .evaluate(
          (element) =>
            getComputedStyle(element).gridTemplateColumns.split(" ").length,
        ),
    ).toBe(width <= 720 ? 2 : 4);
    await quiz(page, scenarioVariants[11].id, "listening");
    await page.getByRole("button", { name: "下一环节", exact: true }).click();
    for (let step = 0; step < 2; step++) {
      await page
        .getByRole("button", { name: "还不会，先看参考", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "能独立表达", exact: true }),
      ).toBeDisabled();
      await page.getByLabel("罗马音", { exact: true }).check();
      await page.getByRole("button", { name: "需要参考", exact: true }).click();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
      ).toBe(false);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: `test-results/revisit-speaking-${width}-${step}.png`,
        fullPage: true,
        animations: "disabled",
      });
      await page.getByRole("button", { name: "下一环节", exact: true }).click();
    }
    await page.getByLabel("假名注音", { exact: true }).check();
    await page.getByLabel("罗马音", { exact: true }).check();
    await page.getByLabel("中文释义", { exact: true }).check();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    expect(
      await page
        .locator(".revisit-lesson button")
        .evaluateAll((buttons) =>
          buttons.every(
            (button) =>
              button.scrollWidth <= button.clientWidth &&
              button.scrollHeight <= button.clientHeight,
          ),
        ),
    ).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `test-results/revisit-reading-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
    await quiz(page, scenarioVariants[11].id, "reading");
    await page
      .getByRole("button", { name: "完成变体练习", exact: true })
      .click();
    await expect(page.locator(".revisit-result-context")).toContainText(
      "间隔 1 天",
    );
  });
}
