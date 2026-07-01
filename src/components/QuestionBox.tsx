import React, { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import type { CheckResult, DiffToken } from "../exercises.js";
import { diffTokens } from "../exercises.js";

export interface QuestionBoxProps {
  title: string;
  progress: string;
  prompt: string;
  hint?: string;
  check: (answer: string) => CheckResult;
  onNext: (grade: number) => void;  // 1=忘了 2=难 3=好 4=轻松
}

type Phase = "input" | "retry" | "success" | "gave-up";

const MAX_ATTEMPTS = 3;

function tokenColor(kind: DiffToken["kind"]): "green" | "red" | "yellow" {
  switch (kind) {
    case "match":
      return "green";
    case "delete":
      return "red";
    case "insert":
      return "yellow";
  }
}

function DiffLine({ tokens }: { tokens: DiffToken[] }): React.JSX.Element {
  return (
    <Text>
      {tokens.map((token, index) => (
        <Text
          key={`${token.char}-${index}`}
          color={tokenColor(token.kind)}
          bold={token.kind !== "match"}
        >
          {token.char}
        </Text>
      ))}
    </Text>
  );
}

export default function QuestionBox({
  title,
  progress,
  prompt,
  hint,
  check,
  onNext,
}: QuestionBoxProps): React.JSX.Element {
  const [answer, setAnswer] = useState("");
  const [lastAnswer, setLastAnswer] = useState("");
  const [lastResult, setLastResult] = useState<CheckResult | null>(null);
  const [phase, setPhase] = useState<Phase>("input");
  const [attempts, setAttempts] = useState(0);
  const [showDiff, setShowDiff] = useState(false);

  useEffect(() => {
    setAnswer("");
    setLastAnswer("");
    setLastResult(null);
    setPhase("input");
    setAttempts(0);
    setShowDiff(false);
  }, [title, progress, prompt]);

  useInput(
    (_input, key) => {
      if (!key.return) return;
      // 推导评分等级：
      //   success & 无重试 → grade 3 (好)
      //   success & 有重试 → grade 2 (难)
      //   gave-up          → grade 1 (忘了)
      const grade =
        phase === "success"
          ? (attempts > 0 ? 2 : 3)
          : 1;
      onNext(grade);
    },
    { isActive: phase === "success" || phase === "gave-up" }
  );

  function submit(value: string): void {
    const trimmed = value.trim();
    if (!trimmed) return;

    const result = check(value);
    setLastAnswer(value);
    setLastResult(result);
    setAnswer("");

    if (trimmed.toLowerCase() === "skip") {
      setShowDiff(false);
      setPhase("gave-up");
      return;
    }

    if (result.correct) {
      setShowDiff(false);
      setPhase("success");
      return;
    }

    const nextAttempts = attempts + 1;
    setAttempts(nextAttempts);
    setShowDiff(true);
    setPhase(nextAttempts >= MAX_ATTEMPTS ? "gave-up" : "retry");
  }

  const borderColor =
    phase === "success" ? "green" : phase === "input" ? "cyan" : "red";
  const inputActive = phase === "input" || phase === "retry";
  const diff =
    showDiff && lastResult && !lastResult.correct
      ? diffTokens(lastAnswer, lastResult.expected)
      : null;

  return (
    <Box
      width={72}
      borderStyle="round"
      borderColor={borderColor}
      flexDirection="column"
      paddingX={1}
      paddingY={1}
    >
      <Box justifyContent="space-between" marginBottom={1}>
        <Text bold color="cyan">
          {title}
        </Text>
        <Text dimColor>{progress}</Text>
      </Box>

      <Text color="yellow" bold>
        {prompt}
      </Text>
      {hint ? <Text dimColor>提示：{hint}</Text> : null}

      {diff ? (
        <Box flexDirection="column" marginTop={1}>
          <Text color="red" bold>
            {phase === "gave-up" ? "不对。" : "不对，再试一次。"}
          </Text>
          <Box marginTop={1} flexDirection="column">
            <Text bold>正确答案:</Text>
            <DiffLine tokens={diff.expectedTokens} />
            <Text bold>你的答案:</Text>
            <DiffLine tokens={diff.userTokens} />
            <Text dimColor>绿色=正确  红色=漏掉  黄色=多打</Text>
          </Box>
        </Box>
      ) : null}

      {phase === "success" ? (
        <Box marginTop={1} flexDirection="column">
          <Text color="green" bold>
            正解！
          </Text>
          <Text dimColor>按 Enter 进入下一题</Text>
        </Box>
      ) : null}

      {phase === "gave-up" && lastResult ? (
        <Box marginTop={1} flexDirection="column">
          <Text color="red" bold>
            本题先记为错误。
          </Text>
          <Text>
            正确答案：<Text color="green">{lastResult.expected}</Text>
          </Text>
          <Text dimColor>按 Enter 进入下一题</Text>
        </Box>
      ) : null}

      {inputActive ? (
        <Box marginTop={1}>
          <Text color="cyan">〉 </Text>
          <TextInput
            value={answer}
            onChange={setAnswer}
            onSubmit={submit}
            placeholder="输入日语答案，或输入 skip"
            focus={inputActive}
            showCursor
          />
        </Box>
      ) : null}
    </Box>
  );
}
