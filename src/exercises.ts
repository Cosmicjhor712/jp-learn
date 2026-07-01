// ============================================================
// 答案比对 + 差异展示
// ============================================================

/** 规范化答案：去除空格、全角转半角、统一标点 */
export function normalize(s: string): string {
  return (
    s
      // 去所有空白
      .replace(/\s+/g, "")
      // 全角英数转半角
      .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) =>
        String.fromCharCode(c.charCodeAt(0) - 0xfee0)
      )
      // 统一标点：全角逗号句号 → 无（日语句子通常不加标点）
      .replace(/[、，,。\.！!？?]/g, "")
  );
}

/** 检查结果 */
export interface CheckResult {
  correct: boolean;
  expected: string;
  userNormalized: string;
}

/** 比对用户答案和标准答案 */
export function checkAnswer(
  userInput: string,
  expected: string,
  alternatives?: string[]
): CheckResult {
  const userNorm = normalize(userInput);
  const expectedNorm = normalize(expected);

  if (userNorm === expectedNorm) {
    return { correct: true, expected, userNormalized: userNorm };
  }

  // 检查替代答案
  if (alternatives) {
    for (const alt of alternatives) {
      if (userNorm === normalize(alt)) {
        return { correct: true, expected, userNormalized: userNorm };
      }
    }
  }

  return { correct: false, expected, userNormalized: userNorm };
}

// ---- LCS-based 字符级 diff ----

export interface DiffToken {
  char: string;
  kind: "match" | "delete" | "insert";
}

/**
 * 对两个字符串做 LCS diff
 * 返回对齐后的 token 列表（按 expected 的顺序，插入的标在对应位置）
 */
function charDiff(user: string, expected: string): {
  expectedTokens: DiffToken[];
  userTokens: DiffToken[];
} {
  const m = expected.length;
  const n = user.length;

  // LCS table
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0)
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (expected[i - 1] === user[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrace
  const expectedTokens: DiffToken[] = [];
  const userTokens: DiffToken[] = [];

  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && expected[i - 1] === user[j - 1]) {
      expectedTokens.unshift({ char: expected[i - 1], kind: "match" });
      userTokens.unshift({ char: user[j - 1], kind: "match" });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      // User has extra char
      expectedTokens.unshift({ char: " ", kind: "insert" });
      userTokens.unshift({ char: user[j - 1], kind: "insert" });
      j--;
    } else {
      // Expected has char user missed
      expectedTokens.unshift({ char: expected[i - 1], kind: "delete" });
      userTokens.unshift({ char: " ", kind: "delete" });
      i--;
    }
  }

  return { expectedTokens, userTokens };
}

/** 返回结构化 diff token，供 Ink/React 组件自行渲染颜色 */
export function diffTokens(
  userInput: string,
  expected: string
): {
  expectedTokens: DiffToken[];
  userTokens: DiffToken[];
} {
  return charDiff(normalize(userInput), normalize(expected));
}


