# 日本語学習ツール (jp-learn)

日语学习工具（终端 + Web）— 强制打字产出 + FSRS 间隔重复 + 听力练习。

## 当前状态

### ✅ 已完成

- **核心引擎**：FSRS-5 间隔重复算法（S/D/R 三参数调度）(`src/srs.ts`)
- **答案比对**：假名级 LCS diff，彩色差异展示 (`src/exercises.ts`)
- **进度持久化**：JSON 文件读写，首次运行自动初始化 (`src/progress.ts`)
- **课程数据**：15 课，298 词汇 + 107 翻译句 (`data/lessons.json`)
- **Ink TUI 界面**：方向键导航 + TextInput 输入 + 面板边框 (`src/app.tsx`, `src/components/`)
- **听力练习**：跨平台语音朗读 + 听写 / 理解选择两种模式，复用答案比对与 FSRS (`src/tts.ts`, `src/components/ChoiceBox.tsx`)
- **Web 版界面**：浏览器可视化 UI，鼠标点击操作，语音走浏览器 Web Speech API，进度与终端版共用 `user/progress.json` (`web/`, `vite.config.ts`)

### ✅ Ink (React TUI) 迁移已完成

当前交互层已经从 readline 迁移到 Ink：

- **方向键菜单**：`src/components/SelectList.tsx`
- **题目输入框**：`src/components/QuestionBox.tsx`
- **进度条**：`src/components/ProgressBar.tsx`
- **状态路由**：`src/app.tsx`
- **Ink 入口**：`src/index.tsx`
- **结构化 diff**：`src/exercises.ts` 新增 `diffTokens()`，Ink 组件用 `<Text color="...">` 渲染颜色

支持的流程：

- 主菜单：学习新课 / 开始复习 / 查看进度 / 退出
- 主菜单：听力练习 → 听写模式 / 理解选择 → 选择已学课程 → 逐题作答
- 学习新课：选课 → 语法 → 词汇预览 → 词汇练习 → 句子练习 → 课程完成
- 复习：按 SRS 到期条目生成队列
- 听写：播放日语（p 重听 · s 慢速）→ 输入听到的内容 → diff 反馈 → 自动进入重试
- 理解选择：播放日语 → 从 4 个中文选项中选出意思，答错标记 ✗ 并允许重选
- 答题：答对后按 Enter 下一题；答错会显示 diff 并自动进入重试；输入 `skip` 跳过

## 重要：核心模块保持不变

以下文件**不需要修改**，直接复用：

| 文件 | 说明 |
|------|------|
| `src/types.ts` | 类型定义 (Lesson, VocabWord, SrsEntry, Progress...) |
| `src/srs.ts` | FSRS-5 算法 (createSrsEntry, updateSrs, getDueEntries, getRetrievability, getStats) |
| `src/exercises.ts` | 答案比对 (checkAnswer, diffTokens) |
| `src/logic.ts` | 终端版 / Web 版共享的业务逻辑 (findReviewPrompt, findListenItem, makeChoices...) |
| `src/progress.ts` | 进度读写 (getOrInitProgress, saveProgress) |
| `src/tts.ts` | 跨平台语音播放（macOS say / Windows SAPI / Linux espeak-ng） |
| `data/lessons.json` | 课程数据 |

课程数据由 `generate_lessons.py` 生成，修改课程请先改脚本再重新生成，不要直接编辑 JSON。

## 运行

### 终端版

```bash
cd jp-learn
npm install
npm start
```

注意：Ink 需要支持 raw mode 的交互式终端，macOS 的 Terminal / iTerm2、Windows Terminal、PowerShell 或 CMD 均可。非交互 shell 会提示无法接收方向键输入并退出。听力模式会自动探测语音引擎：macOS 用内置 `say`（Kyoko 日语声），Windows 用 PowerShell + System.Speech（日语语音包已安装时效果最佳），Linux 用 `espeak-ng` / `espeak` / `spd-say`。未检测到语音引擎时界面仍可操作，只是没有声音。

调试：设置环境变量 `JP_LEARN_SILENT=1` 可静默运行（不播放语音），便于无音频环境测试。

### Web 版

```bash
cd jp-learn
npm run web        # 开发模式，自动打开 http://localhost:5173
npm run build:web  # 构建生产包到 dist/
npm run serve:web  # 本地预览生产包 http://localhost:4173
```

Web 版支持鼠标操作；语音使用浏览器 Web Speech API（推荐 Chrome / Edge / Safari，日语语音会自动选择）。进度通过内置接口读写 `user/progress.json`，与终端版完全一致；接口不可用时自动回退到浏览器 localStorage。

## 验证

```bash
npm run typecheck
```

`typecheck` 同时检查终端版（`src/`）与 Web 版（`web/` + `vite.config.ts`）。
