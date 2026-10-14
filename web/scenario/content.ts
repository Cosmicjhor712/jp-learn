export type JapanesePart = string | { text: string; reading: string };
export interface JapaneseLine {
  parts: JapanesePart[];
  romaji: string;
  translation: string;
}
export const ruby = (text: string, reading: string): JapanesePart => ({
  text,
  reading,
});
export const line = (
  parts: JapanesePart[],
  romaji: string,
  translation: string,
): JapaneseLine => ({ parts, romaji, translation });
export const plainJapanese = (value: JapaneseLine): string =>
  value.parts
    .map((part) => (typeof part === "string" ? part : part.text))
    .join("");

export const stages = [
  "听懂对话",
  "积累表达",
  "开口回应",
  "换个情景",
  "读懂消息",
  "本轮回顾",
] as const;
export const scenarioId = "dinner-invitation-v1";
export const scenarioTitle = "约朋友吃饭";

export const invitation = line(
  [
    ruby("明日", "あした"),
    "、",
    ruby("一緒", "いっしょ"),
    "に",
    ruby("晩", "ばん"),
    "ご",
    ruby("飯", "はん"),
    "を",
    ruby("食", "た"),
    "べませんか。",
  ],
  "ashita, issho ni bangohan o tabemasen ka.",
  "明天一起吃晚饭好吗？",
);
export const acceptance = line(
  [
    "いいですね。",
    ruby("何時", "なんじ"),
    "に",
    ruby("会", "あ"),
    "いますか。",
  ],
  "ii desu ne. nanji ni aimasu ka.",
  "好啊。几点见面？",
);
export const arrangement = line(
  [
    ruby("七時", "しちじ"),
    "に、",
    ruby("駅", "えき"),
    "の",
    ruby("前", "まえ"),
    "で",
    ruby("会", "あ"),
    "いましょう。",
  ],
  "shichiji ni, eki no mae de aimashou.",
  "七点在车站前见吧。",
);
export const confirmation = line(
  ["わかりました。", ruby("楽", "たの"), "しみにしています。"],
  "wakarimashita. tanoshimi ni shite imasu.",
  "好的。我很期待。",
);
export const decline = line(
  [
    "すみません。",
    ruby("明日", "あした"),
    "はちょっと…。",
    ruby("土曜日", "どようび"),
    "はどうですか。",
  ],
  "sumimasen. ashita wa chotto... doyoubi wa dou desu ka.",
  "不好意思，明天不太方便……周六怎么样？",
);
export const dialogue = [
  { speaker: "友人", line: invitation },
  { speaker: "你", line: acceptance },
  { speaker: "友人", line: arrangement },
  { speaker: "你", line: confirmation },
];

export interface MeaningQuestion {
  id: string;
  prompt: string;
  options: string[];
  correct: number;
  explanation: string;
}
export const listeningQuestions: MeaningQuestion[] = [
  {
    id: "listen-intent",
    prompt: "朋友想和你做什么？",
    options: ["一起吃晚饭", "一起去买东西", "在家做早饭"],
    correct: 0,
    explanation:
      "「晩ご飯を食べませんか」是在邀请你一起吃晚饭，不是在询问你是不是不吃饭。",
  },
  {
    id: "listen-time",
    prompt: "约好几点见面？",
    options: ["六点", "七点", "八点"],
    correct: 1,
    explanation:
      "「七時に」是七点；这段晚饭对话里指晚上七点。时间点后面用「に」。",
  },
  {
    id: "listen-place",
    prompt: "在哪里见面？",
    options: ["餐厅里面", "朋友家门口", "车站前"],
    correct: 2,
    explanation:
      "「駅の前で会いましょう」是在约车站前见面。「で」标记见面这个动作发生的地点。",
  },
];
export const expressions = [
  {
    purpose: "发出邀请",
    line: invitation,
    note: "动词ます形去掉ます，加ませんか，可以礼貌地发出邀请。这里不是否定对方。",
  },
  {
    purpose: "接受并追问",
    line: acceptance,
    note: "先回应对方，再问缺少的信息，让对话继续。也可以问「どこで会いますか」（在哪里见面）。",
  },
  {
    purpose: "约定时间地点",
    line: arrangement,
    note: "时间＋に，地点＋で。「会いましょう」表示“见面吧”。",
  },
  {
    purpose: "婉拒并提议",
    line: decline,
    note: "「ちょっと…」在这里委婉表示不方便。后面提出另一个时间，比只说“不行”更容易继续交流。",
  },
];

export interface SpeakingPrompt {
  id: string;
  title: string;
  context: string;
  cue: JapaneseLine | null;
  goals: string[];
  references: JapaneseLine[];
}
export interface ScenarioDefinition {
  id: string;
  title: string;
  objective: string;
  buildsOn?: string;
  listeningHeading: string;
  listeningFocus: string;
  readingFocus: string;
  readingWords: string[];
  transferFocus: string;
  dialogue: { speaker: string; line: JapaneseLine }[];
  listeningQuestions: MeaningQuestion[];
  expressions: { purpose: string; line: JapaneseLine; note: string }[];
  responsePrompts: SpeakingPrompt[];
  transferPrompt: SpeakingPrompt;
  readingMessage: JapaneseLine;
  readingSender: string;
  readingLabel: string;
  readingQuestions: MeaningQuestion[];
}
export const responsePrompts: SpeakingPrompt[] = [
  {
    id: "respond-accept",
    title: "答应邀请，问清时间",
    context: "朋友邀请你明天一起吃晚饭。你愿意去，但还不知道几点见面。",
    cue: invitation,
    goals: ["表达愿意一起去", "询问见面时间"],
    references: [
      acceptance,
      line(
        [
          "ぜひ。",
          ruby("何時", "なんじ"),
          "に",
          ruby("会", "あ"),
          "いましょうか。",
        ],
        "zehi. nanji ni aimashou ka.",
        "当然好。我们几点见呢？",
      ),
    ],
  },
  {
    id: "respond-decline",
    title: "不方便时，也能接下去",
    context: "同一个邀请，但你明天有事。委婉拒绝，再问对方周六能不能去。",
    cue: invitation,
    goals: ["说明明天不方便", "提出周六这个替代时间"],
    references: [
      decline,
      line(
        [
          ruby("明日", "あした"),
          "は",
          ruby("予定", "よてい"),
          "があります。",
          ruby("土曜日", "どようび"),
          "なら",
          ruby("大丈夫", "だいじょうぶ"),
          "です。",
        ],
        "ashita wa yotei ga arimasu. doyoubi nara daijoubu desu.",
        "明天有安排了。周六的话可以。",
      ),
    ],
  },
];
export const transferPrompt: SpeakingPrompt = {
  id: "transfer-coffee",
  title: "这次，换你来邀请",
  context:
    "想约朋友周日下午喝咖啡，下午三点在图书馆前见。你来发出邀请，并提出见面安排。",
  cue: null,
  goals: ["周日一起喝咖啡", "下午三点", "在图书馆前见面"],
  references: [
    line(
      [
        ruby("日曜日", "にちようび"),
        "に、",
        ruby("一緒", "いっしょ"),
        "にコーヒーを",
        ruby("飲", "の"),
        "みませんか。",
        ruby("午後三時", "ごごさんじ"),
        "に、",
        ruby("図書館", "としょかん"),
        "の",
        ruby("前", "まえ"),
        "で",
        ruby("会", "あ"),
        "いましょう。",
      ],
      "nichiyoubi ni, issho ni koohii o nomimasen ka. gogo sanji ni, toshokan no mae de aimashou.",
      "周日一起喝咖啡好吗？下午三点在图书馆前见吧。",
    ),
    line(
      [
        ruby("日曜日", "にちようび"),
        "に、",
        ruby("一緒", "いっしょ"),
        "にカフェに",
        ruby("行", "い"),
        "きませんか。",
        ruby("午後三時", "ごごさんじ"),
        "に、",
        ruby("図書館", "としょかん"),
        "の",
        ruby("前", "まえ"),
        "でどうですか。",
      ],
      "nichiyoubi ni, issho ni kafe ni ikimasen ka. gogo sanji ni, toshokan no mae de dou desu ka.",
      "周日一起去咖啡馆好吗？下午三点，在图书馆前怎么样？",
    ),
  ],
};
export const speakingPrompts = [...responsePrompts, transferPrompt];
export const readingMessage = line(
  [
    ruby("明日", "あした"),
    "のお",
    ruby("店", "みせ"),
    "は「さくら」です。",
    ruby("駅", "えき"),
    "から",
    ruby("歩", "ある"),
    "いて",
    ruby("五分", "ごふん"),
    "です。",
    ruby("予約", "よやく"),
    "は",
    ruby("七時半", "しちじはん"),
    "です。",
    ruby("七時", "しちじ"),
    "に",
    ruby("駅", "えき"),
    "の",
    ruby("前", "まえ"),
    "で",
    ruby("会", "あ"),
    "いましょう。",
  ],
  "ashita no omise wa 'sakura' desu. eki kara aruite gofun desu. yoyaku wa shichiji han desu. shichiji ni eki no mae de aimashou.",
  "明天去的店是“樱”。从车站走过去五分钟。预约的是七点半。七点在车站前见吧。",
);
export const readingQuestions: MeaningQuestion[] = [
  {
    id: "read-time",
    prompt: "你应该几点到车站前？",
    options: ["七点半", "七点", "七点五分"],
    correct: 1,
    explanation:
      "见面是七点，餐厅预约是七点半。阅读时需要区分两件事对应的时间。",
  },
  {
    id: "read-route",
    prompt: "从车站到餐厅要怎么走、多久？",
    options: ["坐车五分钟", "走路半小时", "走路五分钟"],
    correct: 2,
    explanation:
      "「駅から歩いて五分」表示从车站走路五分钟。「歩いて」表示步行。",
  },
];
