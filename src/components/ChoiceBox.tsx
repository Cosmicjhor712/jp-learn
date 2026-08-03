import React, { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";

export interface ChoiceBoxProps {
  title: string;
  progress: string;
  question: string;
  choices: string[];
  correctIndex: number;
  play: (slow: boolean) => void;
  onNext: (grade: number) => void; // 1=忘了 2=难 3=好 4=轻松
}

type Phase = "listen" | "choose" | "success" | "gave-up";

const MAX_WRONG = 2;

export default function ChoiceBox({
  title,
  progress,
  question,
  choices,
  correctIndex,
  play,
  onNext,
}: ChoiceBoxProps): React.JSX.Element {
  const [phase, setPhase] = useState<Phase>("listen");
  const [selected, setSelected] = useState(0);
  const [wrong, setWrong] = useState<number[]>([]);
  const [attempts, setAttempts] = useState(0);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    setPhase("listen");
    setSelected(0);
    setWrong([]);
    setAttempts(0);
    setSlow(false);
  }, [title, progress, question]);

  useEffect(() => {
    if (phase === "listen") play(false);
  }, [phase]);

  useInput(
    (_input, key) => {
      if (!key.return) return;
      const grade = phase === "success" ? (attempts > 0 ? 2 : 3) : 1;
      onNext(grade);
    },
    { isActive: phase === "success" || phase === "gave-up" }
  );

  useInput(
    (input, key) => {
      const ch = input.toLowerCase();

      if (key.return) {
        if (phase === "listen") {
          setPhase("choose");
          return;
        }

        if (phase !== "choose") return;

        if (selected === correctIndex) {
          setPhase("success");
          return;
        }

        const nextAttempts = attempts + 1;
        setAttempts(nextAttempts);
        if (!wrong.includes(selected)) setWrong([...wrong, selected]);
        if (nextAttempts >= MAX_WRONG) setPhase("gave-up");
        return;
      }

      if (ch === "p") {
        play(slow);
        return;
      }

      if (ch === "s") {
        const nextSlow = !slow;
        setSlow(nextSlow);
        play(nextSlow);
        return;
      }

      if (phase !== "choose") return;

      if (key.upArrow || ch === "k") {
        setSelected((cur) => (cur - 1 + choices.length) % choices.length);
      } else if (key.downArrow || ch === "j") {
        setSelected((cur) => (cur + 1) % choices.length);
      }
    },
    { isActive: phase === "listen" || phase === "choose" }
  );

  const borderColor =
    phase === "success" ? "green" : phase === "gave-up" ? "red" : "cyan";

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
        ▶ {question}
      </Text>

      {phase === "listen" ? (
        <Box marginTop={1} flexDirection="column">
          <Text color="cyan" bold>
            正在播放…{slow ? "（慢速）" : ""}
          </Text>
          <Text dimColor>p 重听 · s 慢速 · Enter 开始作答</Text>
        </Box>
      ) : null}

      {phase !== "listen" ? (
        <Box flexDirection="column" marginTop={1}>
          {choices.map((choice, index) => {
            const reveal = phase === "success" || phase === "gave-up";
            const isCorrect = index === correctIndex;
            const isWrong = wrong.includes(index);

            let marker = "○";
            let color: "green" | "red" | "cyan" | undefined;
            let bold = false;

            if (reveal && isCorrect) {
              marker = "●";
              color = "green";
              bold = true;
            } else if (isWrong) {
              marker = "✗";
              color = "red";
            } else if (phase === "choose" && index === selected) {
              marker = "●";
              color = "cyan";
              bold = true;
            }

            return (
              <Box key={index}>
                <Text color={color} bold={bold}>
                  {marker} {choice}
                </Text>
              </Box>
            );
          })}
        </Box>
      ) : null}

      {phase === "choose" ? (
        <Box marginTop={1}>
          <Text dimColor>↑/↓ 选择 · Enter 确认 · p 重听 · s 慢速</Text>
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

      {phase === "gave-up" ? (
        <Box marginTop={1} flexDirection="column">
          <Text color="red" bold>
            本题先记为错误。
          </Text>
          <Text>
            正确答案：<Text color="green">{choices[correctIndex]}</Text>
          </Text>
          <Text dimColor>按 Enter 进入下一题</Text>
        </Box>
      ) : null}
    </Box>
  );
}
