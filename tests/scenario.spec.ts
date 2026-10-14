import { test, expect, type Page } from "@playwright/test";
import {
  scenarioCourses,
  courseUnits,
  getCourseUnit,
  getScenario,
} from "../web/scenario/catalogue.ts";
import {
  LIBRARY_STORAGE_KEY,
  type LearningLibrary,
  newLibrary,
  updateCourse,
  startFocus,
} from "../web/scenario/library.ts";
import {
  listeningQuestions,
  readingQuestions,
  speakingPrompts,
  stages,
} from "../web/scenario/content.ts";
import {
  newScenarioProgress,
  visitStage,
  SCENARIO_STORAGE_KEY,
  type ScenarioProgress,
} from "../web/scenario/progress.ts";

test.use({
  launchOptions: {
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
    ],
  },
});

test.beforeEach(async ({ page }) => {
  // Isolate all progress requests, including the existing app's autosave on mount.
  await page.route("**/api/progress", (route) =>
    route.fulfill({ json: { completedLessons: [], entries: {} } }),
  );
  await page.addInitScript(() => {
    let generation = 0;
    // Mock the utterance too: native .voice only accepts native SpeechSynthesisVoice objects.
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      value: class {
        text: string;
        constructor(text: string) {
          this.text = text;
        }
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
          if (current === generation)
            utterance.onend?.(new Event("end") as SpeechSynthesisEvent);
        }, 30);
      },
    });
  });
});

async function openScenario(page: Page) {
  await page.goto("/");
  await selectCourse(page, scenarioCourses[0].id);
}

async function selectCourse(page: Page, lessonId: string) {
  const course = getScenario(lessonId);
  await expect(
    page.getByRole("heading", { name: "今日学习", exact: true }),
  ).toBeVisible();
  const unit = page
    .locator(".home-course-unit")
    .filter({ hasText: getCourseUnit(lessonId).title });
  await expect(unit).toBeVisible();
  const button = page.getByRole("button", {
    name: `进入情景课：${course.title}`,
    exact: true,
  });
  if (!(await unit.evaluate((element) => (element as HTMLDetailsElement).open)))
    await unit.locator("summary").click();
  await button.click();
}
async function stored(page: Page): Promise<ScenarioProgress> {
  return page.evaluate(
    (key) =>
      JSON.parse(localStorage.getItem(key)!).courses["dinner-invitation-v1"],
    LIBRARY_STORAGE_KEY,
  );
}
async function answerQuiz(page: Page, kind: "listen" | "read") {
  for (const question of kind === "listen"
    ? listeningQuestions
    : readingQuestions) {
    await page
      .getByRole("group", { name: new RegExp(question.prompt) })
      .getByRole("button")
      .nth(question.correct)
      .click();
  }
}
function fixtureAt(stage: number, course = scenarioCourses[0]) {
  const progress = newScenarioProgress(0, course.id);
  progress.heard = true;
  for (const q of course.listeningQuestions)
    progress.answers[q.id] = { choice: q.correct, independent: true };
  progress.expressionsDone = stage >= 2;
  if (stage >= 3)
    for (const p of [...course.responsePrompts, course.transferPrompt].slice(
      0,
      stage === 3
        ? course.responsePrompts.length
        : course.responsePrompts.length + 1,
    ))
      progress.speaking[p.id] = {
        triedFirst: true,
        revealed: true,
        rating: "independent",
      };
  if (stage === 5)
    for (const q of course.readingQuestions)
      progress.answers[q.id] = { choice: q.correct, independent: true };
  progress.stage = stage;
  return progress;
}
async function seed(page: Page, progress: ScenarioProgress) {
  await page.addInitScript(
    ({ key, progress }) => localStorage.setItem(key, JSON.stringify(progress)),
    { key: SCENARIO_STORAGE_KEY, progress },
  );
}

function radarLibrary() {
  const course = scenarioCourses[0];
  const progress = fixtureAt(5);
  for (const answer of Object.values(progress.answers)) answer.supports = [];
  progress.answers[course.listeningQuestions[0].id].independent = false;
  progress.answers[course.listeningQuestions[0].id].supports = [
    "slow",
    "transcript",
  ];
  progress.answers[course.readingQuestions[0].id].independent = false;
  progress.answers[course.readingQuestions[0].id].supports = ["translation"];
  progress.speaking[course.responsePrompts[0].id].rating = "assisted";
  progress.speaking[course.transferPrompt.id].rating = "again";
  progress.completedAt = "2026-10-12T04:00:00.000Z";
  progress.completedRuns = 1;
  return updateCourse(newLibrary(), course.id, progress);
}

async function openRadar(page: Page, library = radarLibrary()) {
  await page.clock.setFixedTime(new Date("2026-10-14T04:00:00Z"));
  await seedLibrary(page, library);
  await page.goto("/");
  await page.getByRole("button", { name: "查看进度", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "练习雷达", exact: true }),
  ).toBeVisible();
}

test("radar distinguishes correct totals, independent proportions, and speaking self-ratings", async ({
  page,
}) => {
  await openRadar(page);
  const region = page.getByRole("region", { name: "练习雷达", exact: true });
  await expect(region.getByRole("img", { name: "四维练习雷达" })).toBeVisible();
  await expect(
    region.getByRole("button", { name: "查看听力理解依据" }),
  ).toContainText("67%");
  await expect(
    region.getByRole("button", { name: "查看听力理解依据" }),
  ).toContainText("答对 3 / 3 题");
  const listening = region.getByRole("region", {
    name: "听力理解依据",
    exact: true,
  });
  await expect(listening).toContainText("借助辅助答对 1 题 · 答错 0 题");
  await expect(listening).toContainText("慢速听 1 题");
  await expect(listening).toContainText("仅 1 个情景，样本较少");
  await region.getByRole("button", { name: "查看迁移表达依据" }).focus();
  await page.keyboard.press("Enter");
  await expect(
    region.getByRole("region", { name: "迁移表达依据", exact: true }),
  ).toContainText("还想练习 1 项");
  await expect(
    region.getByRole("button", { name: "查看迁移表达依据" }),
  ).toContainText("0%");
  await expect(region.locator(".radar-shape")).toHaveCount(1);
  await expect(region.locator(".radar-point")).toHaveCount(4);
});

test("radar missing evidence stays unplotted and offers a real course entry", async ({
  page,
}) => {
  await openRadar(page, newLibrary());
  const region = page.getByRole("region", { name: "练习雷达", exact: true });
  await expect(
    region.getByRole("button", { name: "查看听力理解依据" }),
  ).toContainText("待积累");
  await expect(region.locator(".radar-shape, .radar-point")).toHaveCount(0);
  await expect(region).toContainText("0 次已完成练习");
  await region
    .getByRole("button", { name: "进入推荐课程", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: scenarioCourses[0].title, exact: true }),
  ).toBeVisible();
});

test("radar excludes text-only listening and identifies legacy support details", async ({
  page,
}) => {
  const library = radarLibrary();
  library.attempts[0].progress.heard = false;
  await openRadar(page, library);
  const region = page.getByRole("region", { name: "练习雷达", exact: true });
  await expect(
    region.getByRole("button", { name: "查看听力理解依据" }),
  ).toContainText("待积累");
  await expect(region).toContainText("有 1 次对话文字理解记录");
  await expect(region.locator(".radar-shape")).toHaveCount(0);
  await expect(region.locator(".radar-point")).toHaveCount(3);
  await region.getByRole("button", { name: "查看阅读理解依据" }).click();
  await expect(
    region.getByRole("region", { name: "阅读理解依据", exact: true }),
  ).toContainText("中文释义 1 题");
});

test("radar time filter reveals older history and never fabricates missing aid details", async ({
  page,
}) => {
  const library = radarLibrary();
  const old = library.attempts[0];
  old.completedAt = "2026-08-12T04:00:00.000Z";
  for (const answer of Object.values(old.progress.answers))
    delete answer.supports;
  await openRadar(page, library);
  const region = page.getByRole("region", { name: "练习雷达", exact: true });
  await expect(region).toContainText("0 次已完成练习");
  await region.getByRole("button", { name: "全部记录", exact: true }).click();
  await expect(region).toContainText("1 次已完成练习");
  const detail = region.getByRole("region", {
    name: "听力理解依据",
    exact: true,
  });
  await expect(detail).toContainText("旧记录未保存逐题详情");
  await detail.locator("summary").click();
  await detail
    .getByRole("button", { name: /^回看记录/ })
    .first()
    .click();
  await expect(page.getByText("完整课程回顾", { exact: true })).toBeVisible();
  await expect(page.getByLabel("答对 3 / 3 题", { exact: true })).toBeVisible();
});

test("radar targeted retry updates its dimension without rewriting the course or other dimensions", async ({
  page,
}) => {
  const library = radarLibrary();
  await openRadar(page, library);
  await page.getByRole("button", { name: "查看迁移表达依据" }).click();
  await page.getByRole("button", { name: "再练迁移表达", exact: true }).click();
  await expect(
    page
      .getByRole("heading", {
        name: scenarioCourses[0].transferPrompt.title,
        exact: true,
      })
      .first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "我已说完，查看参考", exact: true })
    .click();
  await page.getByRole("button", { name: "能独立表达", exact: true }).click();
  await page.getByRole("button", { name: "完成单项练习", exact: true }).click();
  await page.getByRole("button", { name: "回到首页", exact: true }).click();
  await page.getByRole("button", { name: "查看进度", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "查看迁移表达依据" }),
  ).toContainText("100%");
  await expect(
    page.getByRole("button", { name: "查看开口回应依据" }),
  ).toContainText("50%");
  await expect(
    page.getByRole("button", { name: "查看听力理解依据" }),
  ).toContainText("67%");
  const saved = await storedLibrary(page);
  expect(saved.attempts).toHaveLength(2);
  expect(saved.attempts[0]).toEqual(library.attempts[0]);
  expect(saved.courses).toEqual(library.courses);
  await page.reload();
  await page.getByRole("button", { name: "查看进度", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "查看迁移表达依据" }),
  ).toContainText("100%");
});

test("radar resumes a pending different practice instead of silently replacing it", async ({
  page,
}) => {
  const library = startFocus(radarLibrary(), {
    lessonId: scenarioCourses[1].id,
    skill: "reading",
  });
  library.focus!.progress.supports.reading = ["translation"];
  await openRadar(page, library);
  await page.getByRole("button", { name: "查看迁移表达依据" }).click();
  await expect(
    page.getByRole("button", { name: "再练迁移表达", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".evidence-practice")).toContainText(
    scenarioCourses[1].title,
  );
  await page
    .getByRole("button", { name: "继续未完成练习", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "再读懂一条消息", exact: true }),
  ).toBeVisible();
  expect((await storedLibrary(page)).focus).toEqual(library.focus);
});

for (const width of [1440, 390, 320]) {
  test(`radar, evidence rows and course progress fit at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 950 });
    const library = radarLibrary();
    const second = fixtureAt(5, scenarioCourses[4]);
    second.completedAt = "2026-10-13T04:00:00.000Z";
    second.completedRuns = 1;
    await openRadar(page, updateCourse(library, second.lessonId, second));
    const region = page.getByRole("region", { name: "练习雷达", exact: true });
    await expect(
      region.getByRole("button", { name: "查看听力理解依据" }),
    ).toContainText("83%");
    await region.locator(".evidence-items summary").click();
    await expect(region.getByRole("button", { name: /^回看记录/ })).toHaveCount(
      6,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    expect(
      await region
        .locator("button")
        .evaluateAll((buttons) =>
          buttons.every(
            (button) =>
              button.scrollWidth <= button.clientWidth &&
              button.scrollHeight <= button.clientHeight,
          ),
        ),
    ).toBe(true);
    // Verify the chart labels and data geometry stay within the SVG at each viewport.
    expect(
      await region
        .locator("svg.practice-radar-chart text")
        .evaluateAll((labels) =>
          labels.every((label) => {
            const box = (label as SVGGraphicsElement).getBBox();
            return (
              box.x >= 0 &&
              box.y >= 0 &&
              box.x + box.width <= 360 &&
              box.y + box.height <= 328
            );
          }),
        ),
    ).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `test-results/radar-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
    await region
      .getByRole("button", { name: "再练听力理解", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "再听懂一次对话", exact: true }),
    ).toBeVisible();
  });
}

test("complete a conversation-first lesson without typing and keep FSRS untouched", async ({
  page,
}) => {
  const writes: unknown[] = [];
  await page.route("**/api/progress", (route) => {
    if (route.request().method() === "PUT")
      writes.push(route.request().postDataJSON());
    return route.fulfill({ json: { completedLessons: [], entries: {} } });
  });
  await openScenario(page);
  const originalWrites = writes.length;
  await expect(
    page.getByRole("button", { name: "下一环节", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText("明天一起吃晚饭好吗？", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "播放对话", exact: true }).click();
  await expect(page.getByText("对话已播放完毕", { exact: true })).toBeVisible();
  await answerQuiz(page, "listen");
  await page.getByRole("button", { name: "下一环节", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "积累表达", exact: true }),
  ).toBeVisible();
  await page.getByLabel("罗马音", { exact: true }).check();
  await expect(
    page.getByText("ashita, issho ni bangohan o tabemasen ka.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "下一环节", exact: true }).click();
  await page
    .getByRole("button", { name: "我已说完，查看参考", exact: true })
    .click();
  await expect(page.locator(".scenario-reference")).toHaveCount(2);
  await page.getByRole("button", { name: "能独立表达", exact: true }).click();
  await page.getByRole("button", { name: "下一个回应", exact: true }).click();
  await page
    .getByRole("button", { name: "还不会，先看参考", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "能独立表达", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "需要参考", exact: true }).click();
  await page.getByRole("button", { name: "下一环节", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "换个情景", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "我已说完，查看参考", exact: true })
    .click();
  await page.getByRole("button", { name: "还想练习", exact: true }).click();
  await page.getByRole("button", { name: "下一环节", exact: true }).click();
  await expect(page.locator(".scenario-message ruby")).toHaveCount(0);
  await answerQuiz(page, "read");
  // Direct navigation to the unlocked report must also count completion exactly once.
  await page
    .getByRole("navigation")
    .getByRole("button", { name: /本轮回顾/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "本轮回顾", exact: true }),
  ).toBeVisible();
  expect((await stored(page)).completedRuns).toBe(1);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: /读懂消息/ })
    .click();
  await page.getByRole("button", { name: "完成本轮", exact: true }).click();
  expect((await stored(page)).completedRuns).toBe(1);
  await expect(
    page
      .getByRole("group", { name: "听懂对话结果", exact: true })
      .getByLabel("答对 3 / 3 题", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".scenario-report")).toContainText("还想练习");
  expect(writes.length).toBe(originalWrites);
  await page.getByRole("button", { name: "回到首页", exact: true }).click();
  await page.getByRole("button", { name: "查看进度", exact: true }).click();
  await expect(page.getByRole("region", { name: "情景课进度" })).toContainText(
    "累计完成 1 轮",
  );
  await page
    .getByRole("button", { name: "进入情景课", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "再练一轮", exact: true }).click();
  const next = await stored(page);
  expect(next.completedRuns).toBe(1);
  expect(next.answers).toEqual({});
  expect(next.stage).toBe(0);
  expect(next.completedAt).toBeNull();
});

test("resume after home and reload preserves first answers and support evidence", async ({
  page,
}) => {
  await openScenario(page);
  await page.getByLabel("日文原文", { exact: true }).check();
  await page.getByRole("button", { name: /一起去买东西/ }).click();
  await expect(page.getByText("还需要巩固", { exact: true })).toBeVisible();
  await page.getByLabel("日文原文", { exact: true }).uncheck();
  await page.getByRole("button", { name: "返回主界面", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "继续情景课", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /一起去买东西/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: /一起吃晚饭/ })).toBeDisabled();
  await page.getByRole("button", { name: "播放对话", exact: true }).click();
  await expect(page.getByText("对话已播放完毕", { exact: true })).toBeVisible();
  await page.getByLabel("日文原文", { exact: true }).uncheck();
  await page.getByRole("button", { name: /七点/ }).click();
  expect((await stored(page)).answers["listen-time"].independent).toBe(false);
  await expect(
    page.getByRole("navigation").getByRole("button", { name: /开口回应/ }),
  ).toBeDisabled();
});

test("answer feedback records the particular supports without changing earlier answers", async ({
  page,
}) => {
  await openScenario(page);
  await page.getByRole("button", { name: "播放对话", exact: true }).click();
  await expect(page.getByText("对话已播放完毕", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /一起吃晚饭/ }).click();
  await page.getByLabel("日文原文", { exact: true }).check();
  await page.getByLabel("假名注音", { exact: true }).check();
  await page.getByLabel("中文释义", { exact: true }).check();
  await page.getByRole("button", { name: /七点/ }).click();
  const first = page.getByRole("group", { name: /朋友想和你做什么/ });
  const second = page.getByRole("group", { name: /约好几点见面/ });
  await expect(first).toContainText("答对了");
  await expect(first).toContainText("作答前未使用提示");
  await expect(second).toContainText(
    "作答前用过：日文原文、假名注音、中文释义",
  );
  const saved = await stored(page);
  expect(saved.answers["listen-intent"].supports).toEqual([]);
  expect(saved.answers["listen-time"].supports).toEqual([
    "transcript",
    "reading",
    "translation",
  ]);
  await page.reload();
  await page.getByRole("button", { name: "继续情景课", exact: true }).click();
  expect((await stored(page)).answers).toEqual(saved.answers);
});

for (const width of [1440, 390, 320]) {
  test(`legacy all-correct assisted report emphasizes full results at ${width}px`, async ({
    page,
  }) => {
    const progress = fixtureAt(5);
    for (const answer of Object.values(progress.answers))
      answer.independent = false;
    progress.supports.listening = [
      "slow",
      "transcript",
      "reading",
      "translation",
    ];
    progress.supports.reading = ["reading", "romaji", "translation"];
    progress.completedAt = "2026-10-13T08:00:00.000Z";
    progress.completedRuns = 1;
    progress.speaking["respond-decline"].rating = "assisted";
    progress.speaking["transfer-coffee"].rating = "again";
    await seed(page, progress);
    await page.setViewportSize({ width, height: 960 });
    await openScenario(page);
    const listening = page.getByRole("group", {
      name: "听懂对话结果",
      exact: true,
    });
    const reading = page.getByRole("group", {
      name: "读懂消息结果",
      exact: true,
    });
    await expect(
      listening.getByLabel("答对 3 / 3 题", { exact: true }),
    ).toBeVisible();
    await expect(
      reading.getByLabel("答对 2 / 2 题", { exact: true }),
    ).toBeVisible();
    await expect(listening).toContainText("无提示答对 0 题");
    await expect(listening).toContainText("借助辅助答对 3 题");
    await expect(reading).toContainText("借助辅助答对 2 题");
    await expect(listening).toContainText("慢速听");
    await expect(reading).toContainText("假名注音、罗马音、中文释义");
    await expect(page.locator(".scenario-next-practice")).toContainText(
      "先不看中文释义",
    );
    await expect(page.locator(".scenario-next-practice")).not.toContainText(
      "区分消息里的见面时间和预约时间",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await page.screenshot({
      path: `test-results/report-assisted-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
    const saved = await stored(page);
    expect(saved.answers).toEqual(progress.answers);
    expect(saved.completedRuns).toBe(1);
    expect(saved.completedAt).toBe(progress.completedAt);
    await page.getByRole("button", { name: "返回主界面", exact: true }).click();
    await page.getByRole("button", { name: "查看进度", exact: true }).click();
    await expect(
      page
        .getByRole("region", { name: "情景课进度" })
        .getByLabel("答对 3 / 3 题", { exact: true }),
    ).toBeVisible();
  });
}

test("unstarted comprehension shows no result instead of a zero score", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "查看进度", exact: true }).click();
  const results = page.getByRole("region", { name: "情景课进度" });
  await expect(
    results.getByRole("group", { name: "听懂对话结果", exact: true }).first(),
  ).toContainText("未开始");
  await expect(
    results.getByRole("group", { name: "读懂消息结果", exact: true }).first(),
  ).toContainText("未开始");
  await expect(results.getByText(/本轮未完整播放对话/)).toHaveCount(0);
});

test("missing Japanese voice offers text practice without claiming listening success", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(window.speechSynthesis, "getVoices", {
      value: () => [],
    }),
  );
  await openScenario(page);
  await expect(page.getByText(/未检测到日语语音/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "播放对话", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("中文释义", { exact: true }).check();
  await answerQuiz(page, "listen");
  const progress = await stored(page);
  expect(progress.heard).toBe(false);
  expect(Object.values(progress.answers).every((a) => !a.independent)).toBe(
    true,
  );
  await page.getByRole("button", { name: "下一环节", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "积累表达", exact: true }),
  ).toBeVisible();
});

test("failed or interrupted playback never becomes completed listening", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(window.speechSynthesis, "speak", {
      value: (utterance: SpeechSynthesisUtterance) =>
        setTimeout(
          () =>
            utterance.onerror?.(
              new Event("error") as SpeechSynthesisErrorEvent,
            ),
          30,
        ),
    }),
  );
  await openScenario(page);
  await page.getByRole("button", { name: "播放对话", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("语音播放失败");
  expect((await stored(page)).heard).toBe(false);
  await expect(page.getByRole("button", { name: /一起吃晚饭/ })).toBeDisabled();
  await page.getByRole("button", { name: "返回主界面", exact: true }).click();
  await page.waitForTimeout(150);
  expect((await stored(page)).heard).toBe(false);
});

test("reading support remains assisted after hiding it and returning", async ({
  page,
}) => {
  await seed(page, fixtureAt(4));
  await openScenario(page);
  await page.getByLabel("假名注音", { exact: true }).check();
  await expect(page.locator(".scenario-message ruby").first()).toBeVisible();
  await page.getByLabel("假名注音", { exact: true }).uncheck();
  await answerQuiz(page, "read");
  await page.getByRole("button", { name: "完成本轮", exact: true }).click();
  expect((await stored(page)).answers["read-time"].independent).toBe(false);
});

test("denied microphone permission leaves speaking and self-assessment usable", async ({
  page,
}) => {
  await seed(page, fixtureAt(2));
  await page.addInitScript(() =>
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: () =>
        Promise.reject(new DOMException("Denied", "NotAllowedError")),
    }),
  );
  await openScenario(page);
  await page.getByRole("button", { name: "录下我的回答", exact: true }).click();
  await expect(page.getByText(/未能使用麦克风/)).toBeVisible();
  await page
    .getByRole("button", { name: "我已说完，查看参考", exact: true })
    .click();
  await page.getByRole("button", { name: "能独立表达", exact: true }).click();
  expect((await stored(page)).speaking["respond-accept"].rating).toBe(
    "independent",
  );
});

async function mockRecorder(page: Page, delayed = false) {
  await page.addInitScript(
    ({ delayed }) => {
      const state = { stopped: 0, revoked: 0, requested: 0, grant: () => {} };
      Object.assign(window, { recorderTest: state });
      const captured = {
        getTracks: () => [
          {
            stop: () => {
              state.stopped += 1;
            },
          },
        ],
      };
      Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
        value: () => {
          state.requested += 1;
          return delayed
            ? new Promise((resolve) => {
                state.grant = () => resolve(captured);
              })
            : Promise.resolve(captured);
        },
      });
      class Recorder {
        state = "inactive";
        mimeType = "audio/webm";
        onstop: (() => void) | null = null;
        ondataavailable: ((event: { data: Blob }) => void) | null = null;
        start() {
          this.state = "recording";
        }
        stop() {
          this.state = "inactive";
          setTimeout(() => {
            this.ondataavailable?.({
              data: new Blob(["test"], { type: this.mimeType }),
            });
            this.onstop?.();
          }, 0);
        }
      }
      Object.defineProperty(window, "MediaRecorder", { value: Recorder });
      const revoke = URL.revokeObjectURL;
      URL.revokeObjectURL = (url) => {
        state.revoked += 1;
        revoke(url);
      };
    },
    { delayed },
  );
}

test("recording is local, replayable, released on stop, and cleared on navigation", async ({
  page,
}) => {
  await seed(page, fixtureAt(2));
  await mockRecorder(page);
  await openScenario(page);
  await page.getByRole("button", { name: "录下我的回答", exact: true }).click();
  await expect(page.getByRole("button", { name: /结束录音/ })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "我已说完，查看参考", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: /结束录音/ }).click();
  await expect(
    page.getByLabel("我的回答录音", { exact: true }),
  ).toHaveAttribute("src", /^blob:/);
  expect(await page.evaluate(() => (window as any).recorderTest.stopped)).toBe(
    1,
  );
  await page.getByRole("button", { name: "重新录音", exact: true }).click();
  await expect(page.getByRole("button", { name: /结束录音/ })).toBeVisible();
  await page.getByRole("button", { name: "返回主界面", exact: true }).click();
  expect(await page.evaluate(() => (window as any).recorderTest.stopped)).toBe(
    2,
  );
  expect(await page.evaluate(() => (window as any).recorderTest.revoked)).toBe(
    1,
  );
  expect(JSON.stringify(await stored(page))).not.toContain("blob:");
});

test("late microphone permission after leaving immediately releases its tracks", async ({
  page,
}) => {
  await seed(page, fixtureAt(2));
  await mockRecorder(page, true);
  await openScenario(page);
  await page.getByRole("button", { name: "录下我的回答", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "取消等待麦克风", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "返回主界面", exact: true }).click();
  await page.evaluate(() => (window as any).recorderTest.grant());
  await expect
    .poll(() => page.evaluate(() => (window as any).recorderTest.stopped))
    .toBe(1);
});

test("recording stops at the 60-second limit", async ({ page }) => {
  await seed(page, fixtureAt(2));
  await mockRecorder(page);
  await openScenario(page);
  await page.clock.install();
  await page.getByRole("button", { name: "录下我的回答", exact: true }).click();
  await expect(page.getByRole("button", { name: /结束录音/ })).toBeVisible();
  await page.clock.runFor(60100);
  await expect(
    page.getByRole("button", { name: "重新录音", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => (window as any).recorderTest.stopped)).toBe(
    1,
  );
});

test("stopping dialogue playback does not count as hearing the complete dialogue", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(window.speechSynthesis, "speak", { value: () => {} }),
  );
  await openScenario(page);
  await page.getByRole("button", { name: "播放对话", exact: true }).click();
  await page.getByRole("button", { name: "停止播放", exact: true }).click();
  expect((await stored(page)).heard).toBe(false);
  await expect(page.getByRole("button", { name: /一起吃晚饭/ })).toBeDisabled();
  await page.getByLabel("日文原文", { exact: true }).check();
  await expect(page.getByRole("button", { name: /一起吃晚饭/ })).toBeEnabled();
});

test("storage failure is visible without blocking the lesson", async ({
  page,
}) => {
  await page.addInitScript((key) => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === key) throw new DOMException("Full", "QuotaExceededError");
      original.call(this, name, value);
    };
  }, LIBRARY_STORAGE_KEY);
  await openScenario(page);
  await expect(page.getByRole("alert")).toContainText("浏览器无法保存进度");
  await page.getByLabel("日文原文", { exact: true }).check();
  await answerQuiz(page, "listen");
  await page.getByRole("button", { name: "下一环节", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "积累表达", exact: true }),
  ).toBeVisible();
});

for (const width of [1440, 390, 320]) {
  test(`scenario surfaces fit and remain navigable at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 960 });
    await seed(page, fixtureAt(5));
    await openScenario(page);
    for (const title of [
      "听懂对话",
      "积累表达",
      "开口回应",
      "换个情景",
      "读懂消息",
      "本轮回顾",
    ]) {
      await page
        .getByRole("navigation")
        .getByRole("button", { name: new RegExp(title) })
        .click();
      if (title === "开口回应" || title === "换个情景")
        await page.getByLabel("罗马音", { exact: true }).check();
      if (title === "读懂消息") {
        await page.getByLabel("假名注音", { exact: true }).check();
        await page.getByLabel("罗马音", { exact: true }).check();
      }
      await expect(
        page.getByRole("heading", { name: title, exact: true }),
      ).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      expect(overflow).toBe(false);
      await page.screenshot({
        path: `test-results/scenario-${width}-${["听懂对话", "积累表达", "开口回应", "换个情景", "读懂消息", "本轮回顾"].indexOf(title)}.png`,
        fullPage: true,
      });
      await expect(
        page.getByRole("button", { name: "返回主界面", exact: true }),
      ).toBeInViewport();
    }
  });
}

async function storedLibrary(page: Page): Promise<LearningLibrary> {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    LIBRARY_STORAGE_KEY,
  );
}

async function seedLibrary(page: Page, library: LearningLibrary) {
  await page.addInitScript(
    ({ key, library }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(library));
    },
    { key: LIBRARY_STORAGE_KEY, library },
  );
}

test("migrate the completed pilot, recommend the next course, and keep v1 untouched", async ({
  page,
}) => {
  const pilot = fixtureAt(5);
  pilot.completedAt = "2026-10-12T08:00:00.000Z";
  pilot.completedRuns = 3;
  await seed(page, pilot);
  await page.goto("/");
  await expect(page.getByRole("region", { name: "今天练什么" })).toContainText(
    "在咖啡店点单",
  );
  await expect(
    page.getByRole("region", { name: "最近一次练习" }),
  ).toContainText("10月12日");
  const library = await storedLibrary(page);
  expect(library.courses[pilot.lessonId]).toEqual(pilot);
  expect(library.attempts).toHaveLength(1);
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!),
      SCENARIO_STORAGE_KEY,
    ),
  ).toEqual(pilot);
  await page.getByRole("button", { name: "开始情景课", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "在咖啡店点单", exact: true }),
  ).toBeVisible();
  await page.getByLabel("日文原文", { exact: true }).check();
  const question = scenarioCourses[1].listeningQuestions[0];
  await page
    .getByRole("group", { name: new RegExp(question.prompt) })
    .getByRole("button")
    .nth(question.correct)
    .click();
  await page.getByRole("button", { name: "返回主界面", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "继续情景课", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "在咖啡店点单", exact: true }),
  ).toBeVisible();
  expect((await storedLibrary(page)).courses[pilot.lessonId]).toEqual(pilot);
});

for (const course of scenarioCourses.slice(1)) {
  test(`complete all stages of ${course.title} with course-specific content and history`, async ({
    page,
  }) => {
    await page.goto("/");
    await selectCourse(page, course.id);
    await page.getByRole("button", { name: "播放对话", exact: true }).click();
    await expect(
      page.getByText("对话已播放完毕", { exact: true }),
    ).toBeVisible();
    for (const q of course.listeningQuestions)
      await page
        .getByRole("group", { name: new RegExp(q.prompt) })
        .getByRole("button")
        .nth(q.correct)
        .click();
    await page.getByRole("button", { name: "下一环节", exact: true }).click();
    await expect(
      page.getByText(course.expressions[0].purpose, { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "下一环节", exact: true }).click();
    for (const [index, prompt] of course.responsePrompts.entries()) {
      await expect(
        page.getByRole("heading", { name: prompt.title, exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "我已说完，查看参考", exact: true })
        .click();
      await page
        .getByRole("button", { name: "能独立表达", exact: true })
        .click();
      if (index < course.responsePrompts.length - 1)
        await expect(
          page.getByRole("button", { name: "下一环节", exact: true }),
        ).toBeDisabled();
      if (index < course.responsePrompts.length - 1)
        await page
          .getByRole("button", { name: "下一个回应", exact: true })
          .click();
    }
    await page.getByRole("button", { name: "下一环节", exact: true }).click();
    await expect(
      page.getByRole("heading", {
        name: course.transferPrompt.title,
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "我已说完，查看参考", exact: true })
      .click();
    await page.getByRole("button", { name: "还想练习", exact: true }).click();
    await page.getByRole("button", { name: "下一环节", exact: true }).click();
    await expect(
      page.getByText(course.readingLabel, { exact: true }),
    ).toBeVisible();
    for (const q of course.readingQuestions)
      await page
        .getByRole("group", { name: new RegExp(q.prompt) })
        .getByRole("button")
        .nth(q.correct)
        .click();
    await page.getByRole("button", { name: "完成本轮", exact: true }).click();
    await expect(
      page.getByLabel("答对 3 / 3 题", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByLabel("答对 2 / 2 题", { exact: true }),
    ).toBeVisible();
    const library = await storedLibrary(page);
    expect(library.attempts).toHaveLength(1);
    expect(library.attempts[0].lessonId).toBe(course.id);
    expect(library.courses[course.id].completedRuns).toBe(1);
    expect(library.courses[scenarioCourses[0].id].answers).toEqual({});
    await page.getByRole("button", { name: "再练一轮", exact: true }).click();
    expect((await storedLibrary(page)).attempts).toEqual(library.attempts);
    await page.getByRole("button", { name: "返回主界面", exact: true }).click();
    await page.getByRole("button", { name: "查看回顾", exact: true }).click();
    await expect(
      page.getByLabel("答对 3 / 3 题", { exact: true }),
    ).toBeVisible();
    expect((await storedLibrary(page)).courses[course.id].answers).toEqual({});
  });
}

test("focused speaking resumes after reload and saves a separate attempt with updated advice", async ({
  page,
}) => {
  const pilot = fixtureAt(5);
  pilot.completedAt = "2026-10-12T08:00:00.000Z";
  pilot.completedRuns = 1;
  pilot.speaking["respond-decline"].rating = "assisted";
  pilot.speaking["transfer-coffee"].rating = "again";
  await seed(page, pilot);
  await page.goto("/");
  await page.getByRole("button", { name: "练这个回应", exact: true }).click();
  await expect(page.locator(".scenario-reference")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "完成单项练习", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "我已说完，查看参考", exact: true })
    .click();
  await page.getByRole("button", { name: "返回主界面", exact: true }).click();
  await page.reload();
  await page
    .getByRole("region", { name: "今天练什么" })
    .getByRole("button", { name: "继续单项练习", exact: true })
    .click();
  await expect(page.locator(".scenario-reference")).toHaveCount(2);
  await page.getByRole("button", { name: "能独立表达", exact: true }).click();
  await page.getByRole("button", { name: "完成单项练习", exact: true }).click();
  await expect(
    page.getByText("本次自评：能独立表达", { exact: true }),
  ).toBeVisible();
  const library = await storedLibrary(page);
  expect(library.courses[pilot.lessonId]).toEqual(pilot);
  expect(library.attempts).toHaveLength(2);
  expect(library.attempts[1].kind).toBe("focus");
  expect(library.attempts[1].promptId).toBe("respond-decline");
  expect(library.focus).toBeNull();
  await page.getByRole("button", { name: "回到首页", exact: true }).click();
  await expect(page.locator(".home-next-practice")).toContainText(
    scenarioCourses[0].transferPrompt.title,
  );
  await page.locator(".home-history summary").click();
  await page.locator(".home-history button").last().click();
  await expect(page.locator(".scenario-report")).toContainText("还想练习");
});

for (const skill of ["listening", "reading"] as const) {
  test(`focused ${skill} saves only its own section`, async ({ page }) => {
    const course = scenarioCourses[2];
    await seedLibrary(
      page,
      startFocus(newLibrary(), { lessonId: course.id, skill }),
    );
    await page.goto("/");
    await page
      .getByRole("button", { name: "继续单项练习", exact: true })
      .click();
    if (skill === "listening")
      await page.getByLabel("日文原文", { exact: true }).check();
    for (const q of skill === "listening"
      ? course.listeningQuestions
      : course.readingQuestions)
      await page
        .getByRole("group", { name: new RegExp(q.prompt) })
        .getByRole("button")
        .nth(q.correct)
        .click();
    await page
      .getByRole("button", { name: "完成单项练习", exact: true })
      .click();
    await expect(
      page.getByLabel(skill === "reading" ? "答对 2 / 2 题" : "答对 3 / 3 题", {
        exact: true,
      }),
    ).toBeVisible();
    if (skill === "listening")
      await expect(page.getByText(/本次未完整播放对话/)).toBeVisible();
    const library = await storedLibrary(page);
    expect(library.attempts[0].skill).toBe(skill);
    expect(library.courses[course.id].completedRuns).toBe(0);
  });
}

for (const width of [1440, 390, 320]) {
  test(`conversation home with history fits at ${width}px`, async ({
    page,
  }) => {
    const pilot = fixtureAt(5);
    pilot.completedAt = "2026-10-12T08:00:00.000Z";
    pilot.completedRuns = 1;
    pilot.speaking["respond-decline"].rating = "assisted";
    await seedLibrary(page, updateCourse(newLibrary(), pilot.lessonId, pilot));
    await page.setViewportSize({ width, height: 960 });
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: "开始情景课", exact: true }),
    ).toBeInViewport();
    await page.locator(".home-history summary").click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    expect(
      await page
        .locator(".learning-home button")
        .evaluateAll((buttons) =>
          buttons
            .filter((button) => button.clientWidth > 0)
            .every(
              (button) =>
                button.scrollWidth <= button.clientWidth &&
                button.scrollHeight <= button.clientHeight,
            ),
        ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/conversation-home-${width}.png`,
      fullPage: true,
    });
  });
}

for (const width of [1440, 390, 320]) {
  test(`expanded courses remain readable with Japanese annotations at ${width}px`, async ({
    page,
  }) => {
    let library = newLibrary();
    for (const course of scenarioCourses.slice(1)) {
      const progress = newScenarioProgress(1, course.id);
      progress.heard = true;
      progress.expressionsDone = true;
      progress.stage = 5;
      progress.completedAt = "2026-10-12T08:00:00.000Z";
      for (const q of [
        ...course.listeningQuestions,
        ...course.readingQuestions,
      ])
        progress.answers[q.id] = { choice: q.correct, independent: true };
      for (const prompt of [...course.responsePrompts, course.transferPrompt])
        progress.speaking[prompt.id] = {
          triedFirst: true,
          revealed: true,
          rating: "independent",
        };
      library = updateCourse(library, course.id, progress);
    }
    await seedLibrary(page, library);
    await page.setViewportSize({ width, height: 960 });
    await page.goto("/");
    for (const course of scenarioCourses.slice(1)) {
      await selectCourse(page, course.id);
      for (const title of stages) {
        await page
          .getByRole("navigation")
          .getByRole("button", { name: new RegExp(title) })
          .click();
        if (title === "听懂对话")
          await page.getByLabel("日文原文", { exact: true }).check();
        if (title === "听懂对话" || title === "读懂消息") {
          await page.getByLabel("假名注音", { exact: true }).check();
          await page.getByLabel("中文释义", { exact: true }).check();
        }
        if (title !== "本轮回顾") {
          const romaji = page.getByLabel("罗马音", { exact: true });
          if (await romaji.count()) await romaji.check();
        }
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
        ).toBe(false);
        if (title === "读懂消息" || title === "开口回应")
          await page.screenshot({
            path: `test-results/${course.id}-${width}-${stages.indexOf(title)}.png`,
            fullPage: true,
          });
      }
      const index = scenarioCourses.indexOf(course);
      if (index < scenarioCourses.length - 1) {
        await page
          .getByRole("button", { name: "学习下一课", exact: true })
          .click();
        await expect(
          page.getByRole("heading", {
            name: scenarioCourses[index + 1].title,
            exact: true,
          }),
        ).toBeVisible();
      } else
        await expect(
          page.getByRole("button", { name: "学习下一课", exact: true }),
        ).toHaveCount(0);
      await page
        .getByRole("button", { name: "返回主界面", exact: true })
        .click();
    }
  });
}

test("four completed courses continue into phase two without losing old progress", async ({
  page,
}) => {
  let library = newLibrary();
  for (const course of scenarioCourses.slice(0, 4))
    library = updateCourse(
      library,
      course.id,
      visitStage(fixtureAt(5, course), 5),
    );
  library.courses = Object.fromEntries(
    scenarioCourses
      .slice(0, 4)
      .map((course) => [course.id, library.courses[course.id]]),
  );
  const old = structuredClone(library);
  await seedLibrary(page, library);
  await page.goto("/");
  await expect(page.getByRole("region", { name: "今天练什么" })).toContainText(
    "认识新朋友，接着聊下去",
  );
  await expect(page.getByRole("region", { name: "情景课程" })).toContainText(
    "已完成 4 / 12 课",
  );
  const units = page.locator(".home-course-unit");
  await expect(units.nth(1)).toHaveAttribute("open", "");
  await expect(units.nth(1).getByRole("button")).toHaveCount(4);
  const updated = await storedLibrary(page);
  expect(updated.attempts).toEqual(old.attempts);
  for (const course of scenarioCourses.slice(0, 4))
    expect(updated.courses[course.id]).toEqual(old.courses[course.id]);
  await page.getByRole("button", { name: "开始情景课", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: scenarioCourses[4].title, exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "返回主界面", exact: true }).click();
  await selectCourse(page, scenarioCourses[3].id);
  await page.getByRole("button", { name: "学习下一课", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: scenarioCourses[4].title, exact: true }),
  ).toBeVisible();
});

test("later phases are freely selectable by keyboard and earlier-course links preserve work", async ({
  page,
}) => {
  await page.goto("/");
  const summary = page
    .locator(".home-course-unit > summary")
    .filter({ hasText: courseUnits[2].title });
  await summary.focus();
  await page.keyboard.press("Enter");
  const advanced = getScenario("cafe-changes-v1");
  await page
    .getByRole("button", { name: `进入情景课：${advanced.title}`, exact: true })
    .click();
  await page.getByLabel("日文原文", { exact: true }).check();
  const question = advanced.listeningQuestions[0];
  await page
    .getByRole("group", { name: new RegExp(question.prompt) })
    .getByRole("button")
    .nth(question.correct)
    .click();
  const before = (await storedLibrary(page)).courses[advanced.id];
  await page
    .getByRole("button", {
      name: `温习：${getScenario(advanced.buildsOn!).title}`,
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "在咖啡店点单", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "返回主界面", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "继续情景课", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: advanced.title, exact: true }),
  ).toBeVisible();
  expect((await storedLibrary(page)).courses[advanced.id]).toEqual(before);
});

for (const width of [1440, 390, 320]) {
  test(`all curriculum phases fit when expanded at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 960 });
    await page.goto("/");
    for (const unit of courseUnits) {
      const details = page
        .locator(".home-course-unit")
        .filter({ hasText: unit.title });
      if (
        !(await details.evaluate(
          (element) => (element as HTMLDetailsElement).open,
        ))
      )
        await details.locator("summary").click();
    }
    await expect(
      page.getByRole("region", { name: "情景课程" }).getByRole("button"),
    ).toHaveCount(12);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `test-results/curriculum-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
    expect(
      await page
        .locator(".home-course-unit button, .home-course-unit summary")
        .evaluateAll((elements) =>
          elements
            .filter(
              (element) =>
                element.scrollWidth > element.clientWidth ||
                element.scrollHeight > element.clientHeight,
            )
            .map((element) => ({
              text: element.textContent,
              scroll: [element.scrollWidth, element.scrollHeight],
              client: [element.clientWidth, element.clientHeight],
            })),
        ),
    ).toEqual([]);
  });
}

test.describe("native recording", () => {
  test.use({
    permissions: ["microphone"],
  });
  test("real MediaRecorder creates playable local audio from a synthetic microphone", async ({
    page,
  }) => {
    await seed(page, fixtureAt(2));
    await openScenario(page);
    await page
      .getByRole("button", { name: "录下我的回答", exact: true })
      .click();
    await expect(page.getByRole("button", { name: /结束录音/ })).toBeVisible();
    await page.waitForTimeout(1200);
    await page.getByRole("button", { name: /结束录音/ }).click();
    const audio = page.getByLabel("我的回答录音", { exact: true });
    await expect(audio).toHaveAttribute("src", /^blob:/);
    await audio.evaluate(async (element) => {
      await (element as HTMLAudioElement).play();
    });
    await expect
      .poll(() =>
        audio.evaluate((element) => (element as HTMLAudioElement).currentTime),
      )
      .toBeGreaterThan(0);
    expect(
      await audio.evaluate(
        async (element) =>
          (await (await fetch((element as HTMLAudioElement).src)).blob()).size,
      ),
    ).toBeGreaterThan(100);
    await page.getByRole("button", { name: "返回主界面", exact: true }).click();
    expect(JSON.stringify(await stored(page))).not.toContain("blob:");
  });
});
