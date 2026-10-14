import { line as l, ruby as r, type ScenarioDefinition } from "./content.ts";

const originalPlan = l(
  [
    r("明日", "あした"),
    "は",
    r("七時", "しちじ"),
    "に",
    r("駅前", "えきまえ"),
    "ですね。",
  ],
  "ashita wa shichiji ni ekimae desu ne.",
  "明天七点在车站前见，对吧？",
);
const delay = l(
  [
    "すみません。",
    r("仕事", "しごと"),
    "が",
    r("長引", "ながび"),
    "きそうです。",
    r("八時", "はちじ"),
    "に",
    r("変更", "へんこう"),
    "できますか。",
  ],
  "sumimasen. shigoto ga nagabikisou desu. hachiji ni henkou dekimasu ka.",
  "不好意思，工作可能要拖晚。可以改到八点吗？",
);
const counteroffer = l(
  [
    r("八時", "はちじ"),
    "はちょっと",
    r("遅", "おそ"),
    "いです。",
    r("日曜日", "にちようび"),
    "の",
    r("昼", "ひる"),
    "はどうですか。",
  ],
  "hachiji wa chotto osoi desu. nichiyoubi no hiru wa dou desu ka.",
  "八点有点晚了。周日中午怎么样？",
);
const newDay = l(
  [
    r("日曜日", "にちようび"),
    "なら",
    r("大丈夫", "だいじょうぶ"),
    "です。",
    r("十二時", "じゅうにじ"),
    "に",
    r("駅前", "えきまえ"),
    "で",
    r("会", "あ"),
    "いましょう。",
  ],
  "nichiyoubi nara daijoubu desu. juuniji ni ekimae de aimashou.",
  "周日可以。十二点在车站前见吧。",
);
const bookingTime = l(
  [
    "お",
    r("店", "みせ"),
    "の",
    r("予約", "よやく"),
    "は",
    r("十二時半", "じゅうにじはん"),
    "に",
    r("変更", "へんこう"),
    "しますね。",
  ],
  "omise no yoyaku wa juuniji han ni henkou shimasu ne.",
  "那我把餐厅预约改到十二点半。",
);
const planConfirm = l(
  [
    "ありがとうございます。",
    r("集合", "しゅうごう"),
    "は",
    r("十二時", "じゅうにじ"),
    "、お",
    r("店", "みせ"),
    "は",
    r("十二時半", "じゅうにじはん"),
    "ですね。",
  ],
  "arigatou gozaimasu. shuugou wa juuniji, omise wa juuniji han desu ne.",
  "谢谢。十二点集合，十二点半到店，对吧？",
);

export const rescheduleCourse: ScenarioDefinition = {
  id: "reschedule-plans-v1",
  title: "临时有事，重新约时间",
  objective: "说明变化、提出替代安排，区分集合与预约时间。",
  buildsOn: "weekend-plans-v1",
  listeningHeading: "原来的晚饭约定需要改期",
  listeningFocus: "改期原因与最终约定",
  readingFocus: "旧约定与新约定",
  readingWords: ["変更", "集合", "予約"],
  transferFocus: "换一个原因，提出另一天的具体时间",
  dialogue: [
    { speaker: "朋友", line: originalPlan },
    { speaker: "你", line: delay },
    { speaker: "朋友", line: counteroffer },
    { speaker: "你", line: newDay },
    { speaker: "朋友", line: bookingTime },
    { speaker: "你", line: planConfirm },
  ],
  listeningQuestions: [
    {
      id: "listen-reason",
      prompt: "为什么想改时间？",
      options: ["工作可能拖晚", "不想见朋友", "餐厅停止营业"],
      correct: 0,
      explanation:
        "「仕事が長引きそう」表示预计工作会拖长；「そう」说明是预期，不是已经结束。",
    },
    {
      id: "listen-final",
      prompt: "最后确定什么时候在车站前见？",
      options: ["明天晚上八点", "周日中午十二点", "周日中午十二点半"],
      correct: 1,
      explanation: "八点的提议没有被接受。最终是「日曜日」「十二時に駅前」。",
    },
    {
      id: "listen-booking",
      prompt: "餐厅预约由谁改到几点？",
      options: ["你改到十二点", "朋友改到晚上八点", "朋友改到十二点半"],
      correct: 2,
      explanation:
        "朋友说「予約は十二時半に変更します」，承担修改餐厅预约这件事。",
    },
  ],
  expressions: [
    {
      purpose: "道歉并说明变化",
      line: delay,
      note: "在第一课的婉拒基础上，加上简短原因和具体替代时间。",
    },
    {
      purpose: "不合适时提出另一种安排",
      line: counteroffer,
      note: "「ちょっと遅い」说明限制，再用「〜はどうですか」继续协商。",
    },
    {
      purpose: "接受可行条件",
      line: newDay,
      note: "复用周末安排课的「〜なら大丈夫」，把可接受的日期说清楚。",
    },
    {
      purpose: "最后核对两种时间",
      line: planConfirm,
      note: "把集合和餐厅预约分别复述，避免只记住其中一个数字。",
    },
  ],
  responsePrompts: [
    {
      id: "respond-delay",
      title: "说明原因，提出晚一小时",
      context: "原定明天七点见。工作可能拖晚，向朋友道歉并提议改到八点。",
      cue: originalPlan,
      goals: ["工作可能拖晚", "道歉并提议八点"],
      references: [
        delay,
        l(
          [
            "ごめんなさい。",
            r("仕事", "しごと"),
            "で",
            r("遅", "おそ"),
            "くなりそうです。",
            r("八時", "はちじ"),
            "でもいいですか。",
          ],
          "gomennasai. shigoto de osoku narisou desu. hachiji demo ii desu ka.",
          "抱歉，工作可能让我晚到。八点也可以吗？",
        ),
      ],
    },
    {
      id: "respond-newday",
      title: "对方不方便，接受另一天",
      context:
        "朋友觉得八点太晚，提出周日中午。周日你有空，约十二点在车站前见。",
      cue: counteroffer,
      goals: ["接受周日中午", "十二点车站前见"],
      references: [
        newDay,
        l(
          [
            "では、",
            r("日曜日", "にちようび"),
            "にしましょう。",
            r("駅前", "えきまえ"),
            "で",
            r("十二時", "じゅうにじ"),
            "に",
            r("会", "あ"),
            "えますか。",
          ],
          "dewa, nichiyoubi ni shimashou. ekimae de juuniji ni aemasu ka.",
          "那就周日吧。能十二点在车站前见吗？",
        ),
      ],
    },
    {
      id: "respond-final",
      title: "分别核对集合与预约",
      context: "朋友负责改餐厅预约。表示感谢，并确认十二点集合、十二点半到店。",
      cue: bookingTime,
      goals: ["感谢朋友", "确认两种时间"],
      references: [
        planConfirm,
        l(
          [
            "ありがとう。",
            r("十二時", "じゅうにじ"),
            "に",
            r("会", "あ"),
            "って、",
            r("十二時半", "じゅうにじはん"),
            "にお",
            r("店", "みせ"),
            "ですね。",
          ],
          "arigatou. juuniji ni atte, juuniji han ni omise desu ne.",
          "谢谢。十二点见面，十二点半到店，对吧？",
        ),
      ],
    },
  ],
  transferPrompt: {
    id: "transfer-weather",
    title: "因为下雨，改到周六",
    context:
      "原本准备明天去公园，但天气预报说明天会下雨。说明原因，提议改到周六上午十点。",
    cue: null,
    goals: ["说明明天会下雨", "提出周六上午十点"],
    references: [
      l(
        [
          r("明日", "あした"),
          "は",
          r("雨", "あめ"),
          "が",
          r("降", "ふ"),
          "るそうです。",
          r("土曜日", "どようび"),
          "の",
          r("午前十時", "ごぜんじゅうじ"),
          "に",
          r("変更", "へんこう"),
          "しませんか。",
        ],
        "ashita wa ame ga furu sou desu. doyoubi no gozen juuji ni henkou shimasen ka.",
        "听说明天会下雨。改到周六上午十点好吗？",
      ),
      l(
        [
          r("明日", "あした"),
          "は",
          r("雨", "あめ"),
          "の",
          r("予報", "よほう"),
          "なので、",
          r("土曜日", "どようび"),
          "の",
          r("朝十時", "あさじゅうじ"),
          "はどうですか。",
        ],
        "ashita wa ame no yohou na node, doyoubi no asa juuji wa dou desu ka.",
        "因为预报明天下雨，周六早上十点怎么样？",
      ),
    ],
  },
  readingSender: "友人",
  readingLabel: "改期确认消息",
  readingMessage: l(
    [
      r("明日", "あした"),
      "の",
      r("夕食", "ゆうしょく"),
      "は",
      r("日曜日", "にちようび"),
      "の",
      r("昼", "ひる"),
      "に",
      r("変更", "へんこう"),
      "しました。",
      r("集合", "しゅうごう"),
      "は",
      r("十二時", "じゅうにじ"),
      "、",
      r("駅前", "えきまえ"),
      "です。お",
      r("店", "みせ"),
      "は",
      r("十二時半", "じゅうにじはん"),
      "に",
      r("予約", "よやく"),
      "しました。",
    ],
    "ashita no yuushoku wa nichiyoubi no hiru ni henkou shimashita. shuugou wa juuniji, ekimae desu. omise wa juuniji han ni yoyaku shimashita.",
    "明天的晚饭已改为周日午饭。十二点在车站前集合。餐厅已预约十二点半。",
  ),
  readingQuestions: [
    {
      id: "read-newplan",
      prompt: "现在该按哪个安排赴约？",
      options: ["明天七点车站前", "周日十二点车站前", "周日十二点半车站前"],
      correct: 1,
      explanation:
        "消息中的「変更しました」说明旧约定已变更，最终集合是周日十二点。",
    },
    {
      id: "read-difference",
      prompt: "集合与餐厅预约相隔多久？",
      options: ["没有间隔", "一小时", "半小时"],
      correct: 2,
      explanation: "十二点集合，十二点半预约，相隔三十分钟。",
    },
  ],
};

const soldOut = l(
  [
    "すみません。",
    r("卵", "たまご"),
    "サンドは",
    r("売", "う"),
    "り",
    r("切", "き"),
    "れです。",
  ],
  "sumimasen. tamago sando wa urikire desu.",
  "不好意思，鸡蛋三明治卖完了。",
);
const alternative = l(
  [
    "そうですか。",
    r("肉", "にく"),
    "の",
    r("入", "はい"),
    "っていないサンドイッチはありますか。",
  ],
  "sou desu ka. niku no haitte inai sandoicchi wa arimasu ka.",
  "这样啊。有不放肉的三明治吗？",
);
const cheese = l(
  ["はい。チーズサンドがあります。"],
  "hai. chiizu sando ga arimasu.",
  "有的，有芝士三明治。",
);
const cheeseOrder = l(
  [
    "では、それを",
    r("一つ", "ひとつ"),
    "と、アイスティーをください。",
    r("砂糖", "さとう"),
    "はいりません。",
  ],
  "dewa, sore o hitotsu to, aisu tii o kudasai. satou wa irimasen.",
  "那请给我一份那个和一杯冰红茶。不要糖。",
);
const hotOnly = l(
  [
    "アイスティーも",
    r("売", "う"),
    "り",
    r("切", "き"),
    "れです。ホットティーでもよろしいですか。",
  ],
  "aisu tii mo urikire desu. hotto tii demo yoroshii desu ka.",
  "冰红茶也卖完了。热红茶可以吗？",
);
const acceptHot = l(
  [
    "はい、ホットでお",
    r("願", "ねが"),
    "いします。",
    r("持", "も"),
    "ち",
    r("帰", "かえ"),
    "りです。",
  ],
  "hai, hotto de onegai shimasu. mochikaeri desu.",
  "可以，请给我热的。我要外带。",
);

export const cafeChangesCourse: ScenarioDefinition = {
  id: "cafe-changes-v1",
  title: "想点的卖完了怎么办",
  objective: "询问替代餐品、表达偏好，再确认修改后的订单。",
  buildsOn: "cafe-order-v1",
  listeningHeading: "点单时连续遇到缺货",
  listeningFocus: "缺货餐品、替代选择与最终饮料",
  readingFocus: "变更后的餐品与合计金额",
  readingWords: ["変更前", "変更後", "合計"],
  transferFocus: "不接受某个替代品，提出另一项需求",
  dialogue: [
    { speaker: "店员", line: soldOut },
    { speaker: "你", line: alternative },
    { speaker: "店员", line: cheese },
    { speaker: "你", line: cheeseOrder },
    { speaker: "店员", line: hotOnly },
    { speaker: "你", line: acceptHot },
  ],
  listeningQuestions: [
    {
      id: "listen-sandwich",
      prompt: "最后选了什么三明治？",
      options: ["鸡蛋三明治", "火腿三明治", "芝士三明治"],
      correct: 2,
      explanation:
        "鸡蛋三明治售罄后，店员提出芝士三明治，你用「それを一つ」接受了它。",
    },
    {
      id: "listen-drink",
      prompt: "最终要的是哪种饮料？",
      options: ["热红茶", "冰红茶", "冰咖啡"],
      correct: 0,
      explanation: "冰红茶也售罄，最后回应「ホットでお願いします」改为热红茶。",
    },
    {
      id: "listen-preference",
      prompt: "哪些要求仍然保留？",
      options: ["加糖、堂食", "不加糖、外带", "加糖、外带"],
      correct: 1,
      explanation:
        "前面说「砂糖はいりません」，最后补充「持ち帰りです」；改为热饮并不表示取消这些要求。",
    },
  ],
  expressions: [
    {
      purpose: "听懂售罄",
      line: soldOut,
      note: "「売り切れ」表示已经卖完，可以接着询问其他选项。",
    },
    {
      purpose: "说明选择条件",
      line: alternative,
      note: "「肉の入っていない」修饰后面的三明治，说明想要不放肉的餐品；再用「〜はありますか」询问。",
    },
    {
      purpose: "接受替代餐品并继续下单",
      line: cheeseOrder,
      note: "「それ」承接店员刚提到的餐品，再复用数量和不要糖的表达。",
    },
    {
      purpose: "接受变更，补充外带",
      line: acceptHot,
      note: "回答对方提出的新选项后，别漏掉仍然重要的用餐方式。",
    },
  ],
  responsePrompts: [
    {
      id: "respond-alternative",
      title: "售罄后问另一个选择",
      context:
        "鸡蛋三明治卖完了。你想吃不放肉的三明治，向店员询问是否有其他选择。",
      cue: soldOut,
      goals: ["回应售罄信息", "询问不放肉的三明治"],
      references: [
        alternative,
        l(
          [
            "わかりました。",
            r("肉", "にく"),
            "なしのサンドイッチはありますか。",
          ],
          "wakarimashita. niku nashi no sandoicchi wa arimasu ka.",
          "知道了。有不放肉的三明治吗？",
        ),
      ],
    },
    {
      id: "respond-order",
      title: "选餐，再说明饮料偏好",
      context: "你接受芝士三明治，要一份，再点一杯不加糖的冰红茶。",
      cue: cheese,
      goals: ["芝士三明治一份", "冰红茶不加糖"],
      references: [
        cheeseOrder,
        l(
          [
            "チーズサンドを",
            r("一つ", "ひとつ"),
            "お",
            r("願", "ねが"),
            "いします。アイスティーは",
            r("砂糖", "さとう"),
            "なしで。",
          ],
          "chiizu sando o hitotsu onegai shimasu. aisu tii wa satou nashi de.",
          "请给我一份芝士三明治。冰红茶不要糖。",
        ),
      ],
    },
    {
      id: "respond-hot",
      title: "再次缺货，确认替换",
      context: "冰红茶也没了，热红茶你可以接受。确认要热的，并告诉店员外带。",
      cue: hotOnly,
      goals: ["接受热红茶", "说明外带"],
      references: [
        acceptHot,
        l(
          [
            "ホットティーで",
            r("大丈夫", "だいじょうぶ"),
            "です。",
            r("持", "も"),
            "ち",
            r("帰", "かえ"),
            "りでお",
            r("願", "ねが"),
            "いします。",
          ],
          "hotto tii de daijoubu desu. mochikaeri de onegai shimasu.",
          "热红茶可以。请帮我打包。",
        ),
      ],
    },
  ],
  transferPrompt: {
    id: "transfer-cold",
    title: "这次只想喝冷饮",
    context:
      "同样听到热红茶的提议，但这次你只想喝冷饮。婉拒热红茶，询问有没有冰咖啡。",
    cue: hotOnly,
    goals: ["婉拒热红茶", "询问冰咖啡"],
    references: [
      l(
        [
          "すみません。",
          r("冷", "つめ"),
          "たいものがいいです。アイスコーヒーはありますか。",
        ],
        "sumimasen. tsumetai mono ga ii desu. aisu koohii wa arimasu ka.",
        "不好意思，我想要冷的。有冰咖啡吗？",
      ),
      l(
        ["ホットはちょっと…。アイスコーヒーにできますか。"],
        "hotto wa chotto... aisu koohii ni dekimasu ka.",
        "热的就不太想要……能换成冰咖啡吗？",
      ),
    ],
  },
  readingSender: "カフェ",
  readingLabel: "本课订单修改单",
  readingMessage: l(
    [
      r("変更前", "へんこうまえ"),
      "：アイスティー。",
      r("変更後", "へんこうご"),
      "：ホットティー、",
      r("砂糖", "さとう"),
      "なし。チーズサンド",
      r("一つ", "ひとつ"),
      "と",
      r("合計六百五十円", "ごうけいろっぴゃくごじゅうえん"),
      "。",
      r("持", "も"),
      "ち",
      r("帰", "かえ"),
      "り。",
      r("番号八番", "ばんごうはちばん"),
      "。",
    ],
    "henkou mae: aisu tii. henkou go: hotto tii, satou nashi. chiizu sando hitotsu to goukei roppyaku gojuu en. mochikaeri. bangou hachiban.",
    "修改前：冰红茶。修改后：热红茶，不加糖。加一份芝士三明治，合计650日元。外带。号码8号。",
  ),
  readingQuestions: [
    {
      id: "read-current",
      prompt: "取餐时应该收到什么饮料？",
      options: ["冰红茶", "加糖的热红茶", "不加糖的热红茶"],
      correct: 2,
      explanation:
        "要读「変更後」这一项，最终饮料是热红茶且不加糖，不能沿用修改前的信息。",
    },
    {
      id: "read-total",
      prompt: "这份订单合计多少钱？",
      options: ["650日元", "800日元", "850日元"],
      correct: 0,
      explanation:
        "「合計六百五十円」是650日元；「番号八番」是取餐号码，不是金额。",
    },
  ],
};

const exchange = l(
  [
    r("昨日", "きのう"),
    r("買", "か"),
    "ったTシャツが",
    r("大", "おお"),
    "きすぎました。",
    r("交換", "こうかん"),
    "できますか。",
  ],
  "kinou katta tii shatsu ga ookisugimashita. koukan dekimasu ka.",
  "昨天买的T恤太大了。可以换吗？",
);
const receipt = l(
  ["レシートはお", r("持", "も"), "ちですか。"],
  "reshiito wa omochi desu ka.",
  "您带小票了吗？",
);
const askMedium = l(
  ["はい、こちらです。Mサイズに", r("交換", "こうかん"), "したいです。"],
  "hai, kochira desu. emu saizu ni koukan shitai desu.",
  "带了，在这里。我想换成M码。",
);
const blackOnly = l(
  [
    r("白", "しろ"),
    "のMサイズは",
    r("在庫", "ざいこ"),
    "がありません。",
    r("黒", "くろ"),
    "ならあります。",
  ],
  "shiro no emu saizu wa zaiko ga arimasen. kuro nara arimasu.",
  "白色M码没库存了。黑色有。",
);
const tryBlack = l(
  [
    r("黒", "くろ"),
    "でも",
    r("大丈夫", "だいじょうぶ"),
    "です。",
    r("先", "さき"),
    "に",
    r("試着", "しちゃく"),
    "してもいいですか。",
  ],
  "kuro demo daijoubu desu. saki ni shichaku shite mo ii desu ka.",
  "黑色也可以。我能先试穿一下吗？",
);
const fitting = l(
  ["はい。", r("試着室", "しちゃくしつ"), "はこちらです。"],
  "hai. shichakushitsu wa kochira desu.",
  "可以。试衣间在这里。",
);

export const exchangeCourse: ScenarioDefinition = {
  id: "shopping-exchange-v1",
  title: "尺码不合适，协商换货",
  objective: "说明购买后的问题，回应店员询问并选择替代品。",
  buildsOn: "clothes-shopping-v1",
  listeningHeading: "带着小票回到服装店",
  listeningFocus: "换货原因、目标尺码和替代颜色",
  readingFocus: "本课告示中的换货期限与所需物品",
  readingWords: ["購入", "以内", "未使用"],
  transferFocus: "不接受替代颜色，询问再次到货时间",
  dialogue: [
    { speaker: "你", line: exchange },
    { speaker: "店员", line: receipt },
    { speaker: "你", line: askMedium },
    { speaker: "店员", line: blackOnly },
    { speaker: "你", line: tryBlack },
    { speaker: "店员", line: fitting },
  ],
  listeningQuestions: [
    {
      id: "listen-problem",
      prompt: "为什么想换T恤？",
      options: ["颜色褪了", "尺码太大", "没有小票"],
      correct: 1,
      explanation: "「大きすぎました」是太大了，「〜すぎる」表示程度过头。",
    },
    {
      id: "listen-stock",
      prompt: "店里现在哪种M码有货？",
      options: ["白色", "蓝色", "黑色"],
      correct: 2,
      explanation: "白色M码缺货，店员说「黒ならあります」，提供黑色作为替代。",
    },
    {
      id: "listen-before",
      prompt: "你想在确定换货前做什么？",
      options: ["先试穿", "再买一件L码", "让店员邮寄"],
      correct: 0,
      explanation:
        "「先に試着してもいいですか」请求先试穿，确认这次尺码是否合适。",
    },
  ],
  expressions: [
    {
      purpose: "说明发生了什么问题",
      line: exchange,
      note: "由试穿时的「大きい」扩展成买完后的「大きすぎました」，并提出换货请求。",
    },
    {
      purpose: "回应凭证询问",
      line: askMedium,
      note: "「こちらです」用于出示小票，再用「〜に交換したい」说明目标。",
    },
    {
      purpose: "听懂库存限制",
      line: blackOnly,
      note: "「在庫がありません」说明无库存；「〜ならあります」给出可用选项。",
    },
    {
      purpose: "接受替代品并先确认",
      line: tryBlack,
      note: "复用许可表达「〜てもいいですか」，把确认尺码放在换货之前。",
    },
  ],
  responsePrompts: [
    {
      id: "respond-problem",
      title: "说明太大，提出换货",
      context: "昨天买的T恤太大，你回到店里。说明问题，并询问能否换货。",
      cue: null,
      goals: ["昨天买的T恤太大", "询问能否换货"],
      references: [
        exchange,
        l(
          [
            "このTシャツは",
            r("昨日買", "きのうか"),
            "いましたが、サイズが",
            r("大", "おお"),
            "きすぎます。",
            r("交換", "こうかん"),
            "をお",
            r("願", "ねが"),
            "いできますか。",
          ],
          "kono tii shatsu wa kinou kaimashita ga, saizu ga ookisugimasu. koukan o onegai dekimasu ka.",
          "这件T恤是昨天买的，但尺码太大了。能帮我换一下吗？",
        ),
      ],
    },
    {
      id: "respond-receipt",
      title: "出示小票，说清目标尺码",
      context: "你带了小票，想换M码。回应店员的询问，并说明要换成什么。",
      cue: receipt,
      goals: ["带了小票", "想换M码"],
      references: [
        askMedium,
        l(
          [
            "レシートはあります。Mサイズに",
            r("替", "か"),
            "えてもらえますか。",
          ],
          "reshiito wa arimasu. emu saizu ni kaete moraemasu ka.",
          "有小票。能帮我换成M码吗？",
        ),
      ],
    },
    {
      id: "respond-substitute",
      title: "接受黑色，但先试穿",
      context: "白色M码没货了，你可以接受黑色，但想先试穿再决定。",
      cue: blackOnly,
      goals: ["接受黑色", "请求先试穿"],
      references: [
        tryBlack,
        l(
          [
            "では、",
            r("黒", "くろ"),
            "をお",
            r("願", "ねが"),
            "いします。",
            r("試着", "しちゃく"),
            "してから",
            r("決", "き"),
            "めてもいいですか。",
          ],
          "dewa, kuro o onegai shimasu. shichaku shite kara kimete mo ii desu ka.",
          "那请拿黑色的。我可以试穿后再决定吗？",
        ),
      ],
    },
  ],
  transferPrompt: {
    id: "transfer-restock",
    title: "这次还是想要白色",
    context:
      "同样听到只剩黑色，但这次你想保留白色。礼貌说明偏好，问白色M码何时再到货。",
    cue: blackOnly,
    goals: ["仍想要白色", "询问M码到货时间"],
    references: [
      l(
        [
          "すみません。やはり",
          r("白", "しろ"),
          "がいいです。Mサイズはいつ",
          r("入荷", "にゅうか"),
          "しますか。",
        ],
        "sumimasen. yahari shiro ga ii desu. emu saizu wa itsu nyuuka shimasu ka.",
        "不好意思，我还是想要白色。M码什么时候到货？",
      ),
      l(
        [
          r("白", "しろ"),
          "のMサイズを",
          r("待", "ま"),
          "ちたいです。いつごろ",
          r("入", "はい"),
          "りますか。",
        ],
        "shiro no emu saizu o machitai desu. itsu goro hairimasu ka.",
        "我想等白色M码。大概什么时候会到？",
      ),
    ],
  },
  readingSender: "店頭の案内",
  readingLabel: "本课店铺告示",
  readingMessage: l(
    [
      r("交換", "こうかん"),
      "は",
      r("購入", "こうにゅう"),
      "から",
      r("七日以内", "なのかいない"),
      "の",
      r("未使用", "みしよう"),
      "の",
      r("商品", "しょうひん"),
      "に",
      r("限", "かぎ"),
      "ります。レシートとタグをお",
      r("持", "も"),
      "ちください。",
      r("在庫", "ざいこ"),
      "がない",
      r("場合", "ばあい"),
      "はスタッフにご",
      r("相談", "そうだん"),
      "ください。",
    ],
    "koukan wa kounyuu kara nanoka inai no mishiyou no shouhin ni kagirimasu. reshiito to tagu o omochi kudasai. zaiko ga nai baai wa sutaffu ni gosoudan kudasai.",
    "本店仅接受购买后七天内、未使用商品的换货。请带小票和吊牌。缺货时请咨询工作人员。",
  ),
  readingQuestions: [
    {
      id: "read-limit",
      prompt: "按本课这家店的告示，哪件商品符合写明的换货条件？",
      options: [
        "两天前购买且未使用",
        "一个月前购买且未使用",
        "昨天购买但已穿着使用",
      ],
      correct: 0,
      explanation:
        "要同时满足「七日以内」和「未使用」。这里只是在读本课虚构店铺的告示，不代表所有店铺的政策。",
    },
    {
      id: "read-bring",
      prompt: "告示要求带上什么？",
      options: ["只带银行卡", "小票和吊牌", "只带商品照片"],
      correct: 1,
      explanation: "「レシートとタグ」是小票与吊牌，两样都被列出。",
    },
  ],
};

const unclearPlace = l(
  [
    r("受付", "うけつけ"),
    "は",
    r("別館", "べっかん"),
    "の",
    r("二階", "にかい"),
    "です。",
  ],
  "uketsuke wa bekkan no nikai desu.",
  "接待处在别馆二楼。",
);
const askMeaning = l(
  [
    "すみません。「",
    r("別館", "べっかん"),
    "」はどういう",
    r("意味", "いみ"),
    "ですか。",
  ],
  "sumimasen. 'bekkan' wa dou iu imi desu ka.",
  "不好意思，“别馆”是什么意思？",
);
const explainAnnex = l(
  [
    "この",
    r("建物", "たてもの"),
    "ではなく、",
    r("隣", "となり"),
    "の",
    r("建物", "たてもの"),
    "です。",
  ],
  "kono tatemono de wa naku, tonari no tatemono desu.",
  "不是这栋楼，是旁边那栋楼。",
);
const wrongFloor = l(
  [
    r("隣", "となり"),
    "の",
    r("建物", "たてもの"),
    "の",
    r("三階", "さんがい"),
    "ですね。",
  ],
  "tonari no tatemono no sangai desu ne.",
  "是旁边那栋楼的三楼吧？",
);
const correctFloor = l(
  [
    "いいえ、",
    r("三階", "さんがい"),
    "ではなく、",
    r("二階", "にかい"),
    "です。エレベーターの",
    r("前", "まえ"),
    "です。",
  ],
  "iie, sangai de wa naku, nikai desu. erebeetaa no mae desu.",
  "不是三楼，是二楼。在电梯前。",
);
const writeRequest = l(
  [
    r("二階", "にかい"),
    "ですね。ありがとうございます。",
    r("場所", "ばしょ"),
    "をここに",
    r("書", "か"),
    "いてもらえますか。",
  ],
  "nikai desu ne. arigatou gozaimasu. basho o koko ni kaite moraemasu ka.",
  "二楼，对吧。谢谢。可以把地点写在这里吗？",
);

export const clarificationCourse: ScenarioDefinition = {
  id: "clarifying-information-v1",
  title: "没听懂时，把信息问清楚",
  objective: "问陌生词、核对信息，听错后修正并请求写下来。",
  buildsOn: "asking-directions-v1",
  listeningHeading: "寻找活动接待处",
  listeningFocus: "陌生词的解释与更正后的楼层",
  readingFocus: "主楼与别馆的不同用途",
  readingWords: ["本館", "別館", "受付"],
  transferFocus: "听不清数字时，请对方放慢并写下时间",
  dialogue: [
    { speaker: "工作人员", line: unclearPlace },
    { speaker: "你", line: askMeaning },
    { speaker: "工作人员", line: explainAnnex },
    { speaker: "你", line: wrongFloor },
    { speaker: "工作人员", line: correctFloor },
    { speaker: "你", line: writeRequest },
  ],
  listeningQuestions: [
    {
      id: "listen-word",
      prompt: "工作人员怎样解释“别馆”？",
      options: ["这栋楼的地下室", "旁边的另一栋楼", "车站里的房间"],
      correct: 1,
      explanation:
        "「この建物ではなく、隣の建物」通过“不是这里，而是旁边”解释位置。",
    },
    {
      id: "listen-correction",
      prompt: "更正之后，接待处到底在几楼？",
      options: ["一楼", "三楼", "二楼"],
      correct: 2,
      explanation:
        "你复述成三楼时，对方明确更正为「三階ではなく、二階」。最后应采用二楼。",
    },
    {
      id: "listen-strategy",
      prompt: "最后你请求对方做什么？",
      options: ["把地点写下来", "替你报名", "陪你坐电梯"],
      correct: 0,
      explanation:
        "「場所をここに書いてもらえますか」请求写下地点，是避免再次记错的一种办法。",
    },
  ],
  expressions: [
    {
      purpose: "询问不认识的词",
      line: askMeaning,
      note: "「〜はどういう意味ですか」用于问意思，不必因为一个词不懂就停止整个对话。",
    },
    {
      purpose: "听懂对比解释",
      line: explainAnnex,
      note: "「Aではなく、B」表示不是A而是B，要特别留意后面的修正信息。",
    },
    {
      purpose: "用复述暴露误解",
      line: wrongFloor,
      note: "这是本课里故意复述错的例子，不是正确地点。后续对方纠正为二楼。",
    },
    {
      purpose: "接受纠正并请求文字帮助",
      line: writeRequest,
      note: "结合「〜ですね」确认与「書いてもらえますか」请求，让交流能够继续。",
    },
  ],
  responsePrompts: [
    {
      id: "respond-meaning",
      title: "遇到不认识的词",
      context: "你听到了“べっかん”，但不明白意思。礼貌询问这个词的含义。",
      cue: unclearPlace,
      goals: ["说明要问的词", "询问意思"],
      references: [
        askMeaning,
        l(
          [
            "すみません。「べっかん」がわかりません。どういう",
            r("意味", "いみ"),
            "ですか。",
          ],
          "sumimasen. 'bekkan' ga wakarimasen. dou iu imi desu ka.",
          "不好意思，我不懂“べっかん”。是什么意思？",
        ),
      ],
    },
    {
      id: "respond-building",
      title: "确认自己理解的建筑",
      context:
        "对方解释是旁边那栋楼。你现在只核对建筑：不是这里，而是旁边的楼，对吗？",
      cue: explainAnnex,
      goals: ["不是眼前这栋楼", "确认旁边那栋楼"],
      references: [
        l(
          [
            "ここではなく、",
            r("隣", "となり"),
            "の",
            r("建物", "たてもの"),
            "ですね。",
          ],
          "koko de wa naku, tonari no tatemono desu ne.",
          "不是这里，是旁边那栋楼，对吧？",
        ),
        l(
          [
            r("隣", "となり"),
            "の",
            r("建物", "たてもの"),
            "に",
            r("行", "い"),
            "くんですね。この",
            r("建物", "たてもの"),
            "ではないんですね。",
          ],
          "tonari no tatemono ni iku n desu ne. kono tatemono de wa nai n desu ne.",
          "是去旁边那栋楼吧。不是这栋楼，对吧？",
        ),
      ],
    },
    {
      id: "respond-correction",
      title: "修正楼层，请对方写下来",
      context:
        "刚才你一度把楼层听成三楼，对方纠正为二楼。接受纠正，表示感谢，并请求写下地点。",
      cue: correctFloor,
      goals: ["确认是二楼", "感谢并请写下地点"],
      references: [
        writeRequest,
        l(
          [
            "わかりました。",
            r("二階", "にかい"),
            "ですね。ありがとうございます。",
            r("場所", "ばしょ"),
            "を",
            r("書", "か"),
            "いていただけますか。",
          ],
          "wakarimashita. nikai desu ne. arigatou gozaimasu. basho o kaite itadakemasu ka.",
          "明白了，是二楼。谢谢。能把地点写下来吗？",
        ),
      ],
    },
  ],
  transferPrompt: {
    id: "transfer-time",
    title: "这次没听清的是时间",
    context:
      "工作人员说活动开始时间，但你没听清数字。请对方慢一点再说一次，并请求写下时间。",
    cue: null,
    goals: ["请对方慢一点重复", "请求写下时间"],
    references: [
      l(
        [
          "すみません。もう",
          r("一度", "いちど"),
          "ゆっくりお",
          r("願", "ねが"),
          "いします。",
          r("時間", "じかん"),
          "も",
          r("書", "か"),
          "いてもらえますか。",
        ],
        "sumimasen. mou ichido yukkuri onegai shimasu. jikan mo kaite moraemasu ka.",
        "不好意思，请再慢一点说一遍。也可以把时间写下来吗？",
      ),
      l(
        [
          r("時間", "じかん"),
          "がよく",
          r("聞", "き"),
          "き",
          r("取", "と"),
          "れませんでした。ゆっくり",
          r("言", "い"),
          "って、ここに",
          r("書", "か"),
          "いていただけますか。",
        ],
        "jikan ga yoku kikitoremasen deshita. yukkuri itte, koko ni kaite itadakemasu ka.",
        "时间没太听清。可以慢一点说，并写在这里吗？",
      ),
    ],
  },
  readingSender: "イベント案内",
  readingLabel: "工作人员写下的便条",
  readingMessage: l(
    [
      r("受付", "うけつけ"),
      "：",
      r("別館二階", "べっかんにかい"),
      "、エレベーターの",
      r("前", "まえ"),
      "。",
      r("会場", "かいじょう"),
      "：",
      r("本館三階", "ほんかんさんがい"),
      "。",
      r("先", "さき"),
      "に",
      r("受付", "うけつけ"),
      "で",
      r("名前", "なまえ"),
      "を",
      r("伝", "つた"),
      "えてから、",
      r("会場", "かいじょう"),
      "へ",
      r("来", "き"),
      "てください。",
    ],
    "uketsuke: bekkan nikai, erebeetaa no mae. kaijou: honkan sangai. saki ni uketsuke de namae o tsutaete kara, kaijou e kite kudasai.",
    "接待处：别馆二楼，电梯前。会场：主楼三楼。请先到接待处报姓名，再来会场。",
  ),
  readingQuestions: [
    {
      id: "read-first",
      prompt: "应该先去哪里？",
      options: ["别馆二楼接待处", "主楼三楼会场", "主楼二楼电梯前"],
      correct: 0,
      explanation:
        "「先に受付で〜てから」明确要求先去接待处，然后再去会场。两栋楼、两种用途不能混淆。",
    },
    {
      id: "read-action",
      prompt: "到接待处先做什么？",
      options: ["购买餐券", "报自己的姓名", "直接找座位"],
      correct: 1,
      explanation: "「名前を伝えてから」是先告知姓名，不是买票或直接入座。",
    },
  ],
};
