# 日本語学習ツール (jp-learn)

终端交互式日语学习工具 — 强制打字产出 + FSRS 间隔重复。

## 当前状态

### ✅ 已完成

- **核心引擎**：FSRS-5 间隔重复算法（S/D/R 三参数调度）(`src/srs.ts`)
- **答案比对**：假名级 LCS diff，彩色差异展示 (`src/exercises.ts`)
- **进度持久化**：JSON 文件读写，首次运行自动初始化 (`src/progress.ts`)
- **课程数据**：15 课，298 词汇 + 107 翻译句 (`data/lessons.json`)
- **Ink TUI 界面**：方向键导航 + TextInput 输入 + 面板边框 (`src/app.tsx`, `src/components/`)
- **听力练习**：macOS 语音朗读（`say`）+ 听写 / 理解选择两种模式，复用答案比对与 FSRS (`src/tts.ts`, `src/components/ChoiceBox.tsx`)

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
| `src/progress.ts` | 进度读写 (getOrInitProgress, saveProgress) |
| `src/tts.ts` | 听力语音播放（macOS say，Kyoko 日语声） |
| `data/lessons.json` | 课程数据 |

课程数据由 `generate_lessons.py` 生成，修改课程请先改脚本再重新生成，不要直接编辑 JSON。

## 运行

```bash
cd jp-learn
npm install
npm start
```

注意：Ink 需要支持 raw mode 的交互式终端，macOS 的 Terminal / iTerm2、Windows Terminal、PowerShell 或 CMD 均可。非交互 shell 会提示无法接收方向键输入并退出。听力模式依赖 macOS 内置 `say`（日语语音 Kyoko），Windows / Linux 下语音不会播放（界面仍可操作）。

调试：设置环境变量 `JP_LEARN_SILENT=1` 可静默运行（不播放语音），便于无音频环境测试。

## 验证

```bash
npm run typecheck
```
