// ============================================================
// 核心类型定义
// ============================================================

/** 一个词汇条目 */
export interface VocabWord {
  id: string;            // 唯一标识，如 "watashi"
  japanese: string;      // 日文写法（假名为主，可含基础汉字）
  english: string;       // 英文/中文释义
  partOfSpeech: string;  // 词性：名詞、動詞、形容詞、助詞...
  reading?: string;      // 读法（仅当 japanese 含汉字时需要）
}

/** 语法说明 */
export interface GrammarNote {
  pattern: string;       // 句型模式，如「A は B です」
  explanation: string;   // 中文解释
  example: string;       // 一个例句
}

/** 翻译句子（练习用） */
export interface Sentence {
  id: string;
  english: string;       // 要翻译的句子（中文/英文提示）
  japanese: string;      // 标准答案（日文）
  alternatives?: string[]; // 可接受的其他答案
  grammarNote?: string;  // 关联的语法点说明
}

/** 一节课 */
export interface Lesson {
  id: string;
  title: string;         // 如「第1課：自己紹介」
  description: string;   // 简短说明
  vocabulary: VocabWord[];
  grammar: GrammarNote[];
  sentences: Sentence[];
}

/** SRS 条目状态 — FSRS (Free Spaced Repetition Scheduler) */
export interface SrsEntry {
  itemId: string;        // 对应 VocabWord.id 或 Sentence.id
  itemType: "word" | "sentence";
  stability: number;     // 记忆稳定度（天），值越大越牢固
  difficulty: number;    // 难度 (1~10)，1=最易 10=最难
  retrievability: number; // 复习时的回忆概率 (0~1)
  interval: number;      // 当前间隔（天）
  nextReview: string;    // 下次复习日期 (YYYY-MM-DD)
  lastReview: string;    // 上次复习日期
  repetitions: number;   // 总复习次数
}

/** 用户整体进度 */
export interface Progress {
  entries: Record<string, SrsEntry>;  // itemId → SRS 状态
  completedLessons: string[];          // 已完成的课程 ID
}
