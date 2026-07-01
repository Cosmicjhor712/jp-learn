# 日本語学習ツール (jp-learn)

终端交互式日语学习工具 — 强制打字产出 + SRS 间隔重复。

## 当前状态

### ✅ 已完成

- **核心引擎**：SM-2 间隔重复算法 (`src/srs.ts`)
- **答案比对**：假名级 LCS diff，彩色差异展示 (`src/exercises.ts`)
- **进度持久化**：JSON 文件读写，首次运行自动初始化 (`src/progress.ts`)
- **课程数据**：3 课，38 词汇 + 18 翻译句 (`data/lessons.json`)
- **Ink TUI 界面**：方向键导航 + TextInput 输入 + 面板边框 (`src/app.tsx`, `src/components/`)

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
- 学习新课：选课 → 语法 → 词汇预览 → 词汇练习 → 句子练习 → 课程完成
- 复习：按 SRS 到期条目生成队列
- 答题：答对后按 Enter 下一题；答错会显示 diff 并自动进入重试；输入 `skip` 跳过

## 重要：核心模块保持不变

以下文件**不需要修改**，直接复用：

| 文件 | 说明 |
|------|------|
| `src/types.ts` | 类型定义 (Lesson, VocabWord, SrsEntry, Progress...) |
| `src/srs.ts` | SM-2 算法 (createSrsEntry, updateSrs, getDueEntries, getStats) |
| `src/exercises.ts` | 答案比对 (checkAnswer, diffTokens) |
| `src/progress.ts` | 进度读写 (getOrInitProgress, saveProgress) |
| `data/lessons.json` | 课程数据 |

## 运行

```bash
cd jp-learn
npm start
```

注意：Ink 需要支持 raw mode 的交互式终端，建议在 PowerShell、CMD 或 Windows Terminal 中运行。非交互 shell 会提示无法接收方向键输入。

## 验证

```bash
npm run typecheck
```
