import { line as l, ruby as r, type ScenarioDefinition } from "./content.ts";

const service = l(
  [
    "いらっしゃいませ。",
    r("店内", "てんない"),
    "でお",
    r("召", "め"),
    "し",
    r("上", "あ"),
    "がりですか。",
  ],
  "irasshaimase. tennai de omeshiagari desu ka.",
  "欢迎光临。您在店里用餐吗？",
);
const order = l(
  [
    r("持", "も"),
    "ち",
    r("帰", "かえ"),
    "りでお",
    r("願", "ねが"),
    "いします。サンドイッチを",
    r("一つ", "ひとつ"),
    "と、アイスコーヒーを",
    r("一つ", "ひとつ"),
    "ください。",
  ],
  "mochikaeri de onegai shimasu. sandoicchi o hitotsu to, aisu koohii o hitotsu kudasai.",
  "请帮我打包。请给我一个三明治和一杯冰咖啡。",
);
const additions = l(
  [r("砂糖", "さとう"), "とミルクはいりますか。"],
  "satou to miruku wa irimasu ka.",
  "需要糖和牛奶吗？",
);
const milk = l(
  [
    r("砂糖", "さとう"),
    "はいりません。ミルクだけお",
    r("願", "ねが"),
    "いします。",
  ],
  "satou wa irimasen. miruku dake onegai shimasu.",
  "不要糖。只要牛奶。",
);
const water = l(
  ["お", r("水", "みず"), "を", r("一杯", "いっぱい"), "いただけますか。"],
  "omizu o ippai itadakemasu ka.",
  "可以给我一杯水吗？",
);

export const cafeCourse: ScenarioDefinition = {
  id: "cafe-order-v1",
  title: "在咖啡店点单",
  objective: "点一份餐，说明堂食或外带，说清自己的口味。",
  listeningHeading: "柜台前的一次点单",
  listeningFocus: "餐品、用餐方式和口味",
  readingFocus: "取餐号码和付款金额",
  readingWords: ["番号", "受け取り口", "八百円"],
  transferFocus: "换餐品、数量和用餐方式",
  dialogue: [
    { speaker: "店员", line: service },
    { speaker: "你", line: order },
    { speaker: "店员", line: additions },
    { speaker: "你", line: milk },
  ],
  listeningQuestions: [
    {
      id: "listen-meal",
      prompt: "客人点了什么？",
      options: ["三明治和冰咖啡", "蛋糕和红茶", "三明治和热咖啡"],
      correct: 0,
      explanation:
        "「サンドイッチ」是三明治，「アイスコーヒー」是冰咖啡；「一つと、一つ」连接两样餐品。",
    },
    {
      id: "listen-service",
      prompt: "客人在哪里用餐？",
      options: ["在店里", "打包带走", "还没决定"],
      correct: 1,
      explanation: "「持ち帰りでお願いします」表示要外带，而不是堂食。",
    },
    {
      id: "listen-milk",
      prompt: "咖啡需要加什么？",
      options: ["糖和牛奶", "只加糖", "只加牛奶"],
      correct: 2,
      explanation: "「砂糖はいりません」是不要糖；「ミルクだけ」是只要牛奶。",
    },
  ],
  expressions: [
    {
      purpose: "点餐并说明数量",
      line: order,
      note: "「〜を一つください」可以用于点一份餐品。点多样东西时用「と」连接。",
    },
    {
      purpose: "听懂店员的提问",
      line: service,
      note: "「お召し上がり」是店员对顾客说“吃、喝”的礼貌表达。回答「店内で」是堂食，「持ち帰りで」是外带。",
    },
    {
      purpose: "说明不要什么",
      line: milk,
      note: "「〜はいりません」表示不需要；「〜だけ」表示只要这一样。",
    },
    {
      purpose: "礼貌提出请求",
      line: water,
      note: "「〜をいただけますか」是礼貌的请求，也可以说「お水をください」。",
    },
  ],
  responsePrompts: [
    {
      id: "respond-order",
      title: "说清餐品和外带",
      context: "你想打包一个三明治和一杯冰咖啡。回应店员，说明用餐方式并点餐。",
      cue: service,
      goals: ["说明外带", "一个三明治", "一杯冰咖啡"],
      references: [
        order,
        l(
          [
            "サンドイッチとアイスコーヒーを",
            r("一つ", "ひとつ"),
            "ずつください。",
            r("持", "も"),
            "ち",
            r("帰", "かえ"),
            "りです。",
          ],
          "sandoicchi to aisu koohii o hitotsu zutsu kudasai. mochikaeri desu.",
          "请给我三明治和冰咖啡各一份。要外带。",
        ),
      ],
    },
    {
      id: "respond-preference",
      title: "说明自己的口味",
      context: "你不想加糖，但需要牛奶。回答店员，不必重复整个订单。",
      cue: additions,
      goals: ["不要糖", "只要牛奶"],
      references: [
        milk,
        l(
          [
            "ミルクはお",
            r("願", "ねが"),
            "いします。",
            r("砂糖", "さとう"),
            "はなしで。",
          ],
          "miruku wa onegai shimasu. satou wa nashi de.",
          "请给我牛奶。不加糖。",
        ),
      ],
    },
  ],
  transferPrompt: {
    id: "transfer-tea",
    title: "换成两杯热红茶",
    context: "这次和朋友在店里坐一会儿。点两杯热红茶，并说明不要糖。",
    cue: null,
    goals: ["堂食", "两杯热红茶", "不要糖"],
    references: [
      l(
        [
          r("店内", "てんない"),
          "でお",
          r("願", "ねが"),
          "いします。",
          r("温", "あたた"),
          "かい",
          r("紅茶", "こうちゃ"),
          "を",
          r("二つ", "ふたつ"),
          "ください。",
          r("砂糖", "さとう"),
          "はいりません。",
        ],
        "tennai de onegai shimasu. atatakai koucha o futatsu kudasai. satou wa irimasen.",
        "在店里喝。请给我两杯热红茶。不要糖。",
      ),
      l(
        [
          "ホットティーを",
          r("二つ", "ふたつ"),
          "、",
          r("砂糖", "さとう"),
          "なしでお",
          r("願", "ねが"),
          "いします。",
          r("店内", "てんない"),
          "で",
          r("飲", "の"),
          "みます。",
        ],
        "hotto tii o futatsu, satou nashi de onegai shimasu. tennai de nomimasu.",
        "请给我两杯不加糖的热红茶。在店里喝。",
      ),
    ],
  },
  readingSender: "カフェ",
  readingLabel: "取餐单",
  readingMessage: l(
    [
      r("番号", "ばんごう"),
      "は",
      r("十二番", "じゅうにばん"),
      "です。お",
      r("会計", "かいけい"),
      "は",
      r("八百円", "はっぴゃくえん"),
      "です。",
      r("受", "う"),
      "け",
      r("取", "と"),
      "り",
      r("口", "ぐち"),
      "でお",
      r("待", "ま"),
      "ちください。",
    ],
    "bangou wa juuniban desu. okaikei wa happyaku en desu. uketoriguchi de omachi kudasai.",
    "号码是12号。共800日元。请在取餐口等候。",
  ),
  readingQuestions: [
    {
      id: "read-number",
      prompt: "该等哪个取餐号码？",
      options: ["2号", "12号", "20号"],
      correct: 1,
      explanation: "「十二番」是12号；「番号」说明它是号码，不是价格。",
    },
    {
      id: "read-price",
      prompt: "这次需要付多少钱？",
      options: ["80日元", "1200日元", "800日元"],
      correct: 2,
      explanation:
        "「お会計は八百円」表示结账金额为800日元。「八百」读作はっぴゃく。",
    },
  ],
};

const askWay = l(
  ["すみません。", r("図書館", "としょかん"), "はどこですか。"],
  "sumimasen. toshokan wa doko desu ka.",
  "不好意思，请问图书馆在哪里？",
);
const directions = l(
  [
    "この",
    r("道", "みち"),
    "をまっすぐ",
    r("行", "い"),
    "って、",
    r("二", "ふた"),
    "つ",
    r("目", "め"),
    "の",
    r("角", "かど"),
    "を",
    r("右", "みぎ"),
    "に",
    r("曲", "ま"),
    "がってください。",
  ],
  "kono michi o massugu itte, futatsume no kado o migi ni magatte kudasai.",
  "沿这条路直走，在第二个路口右转。",
);
const duration = l(
  [r("歩", "ある"), "いて", r("何分", "なんぷん"), "ぐらいですか。"],
  "aruite nanpun gurai desu ka.",
  "走路大约几分钟？",
);
const location = l(
  [
    r("五分", "ごふん"),
    "ぐらいです。",
    r("図書館", "としょかん"),
    "は",
    r("郵便局", "ゆうびんきょく"),
    "の",
    r("隣", "となり"),
    "にあります。",
  ],
  "gofun gurai desu. toshokan wa yuubinkyoku no tonari ni arimasu.",
  "大约五分钟。图书馆在邮局旁边。",
);
const repeat = l(
  [
    "すみません。もう",
    r("一度", "いちど"),
    "、ゆっくりお",
    r("願", "ねが"),
    "いします。",
  ],
  "sumimasen. mou ichido, yukkuri onegai shimasu.",
  "不好意思，请再慢一点说一遍。",
);

export const directionsCourse: ScenarioDefinition = {
  id: "asking-directions-v1",
  title: "问路与确认方向",
  objective: "问清怎么走、要多久，没听清时请对方再说一遍。",
  listeningHeading: "去图书馆的路上",
  listeningFocus: "转弯方向、步行时间和地标",
  readingFocus: "开放时间和休馆日",
  readingWords: ["午前", "午後", "休み"],
  transferFocus: "换目的地并追问时间",
  dialogue: [
    { speaker: "你", line: askWay },
    { speaker: "路人", line: directions },
    { speaker: "你", line: duration },
    { speaker: "路人", line: location },
  ],
  listeningQuestions: [
    {
      id: "listen-turn",
      prompt: "应该在哪里往哪边转？",
      options: ["第一个路口左转", "第二个路口右转", "第二个路口左转"],
      correct: 1,
      explanation: "「二つ目の角」是第二个路口；「右に曲がって」是向右转。",
    },
    {
      id: "listen-duration",
      prompt: "步行大约多久？",
      options: ["五分钟", "十五分钟", "五十分钟"],
      correct: 0,
      explanation:
        "「五分ぐらい」表示约五分钟。「ぐらい」表示大约，不是精确计时。",
    },
    {
      id: "listen-landmark",
      prompt: "图书馆在什么地方旁边？",
      options: ["车站", "便利店", "邮局"],
      correct: 2,
      explanation: "「郵便局の隣」表示邮局旁边。地标可以帮助你确认有没有走错。",
    },
  ],
  expressions: [
    {
      purpose: "礼貌问路",
      line: askWay,
      note: "先用「すみません」引起注意，再用「〜はどこですか」问位置。",
    },
    {
      purpose: "听懂方向",
      line: directions,
      note: "「まっすぐ」是直走；「右」是右边，「左」是左边。「〜てください」表示请做某个动作。",
    },
    {
      purpose: "追问步行时间",
      line: duration,
      note: "「歩いて」说明是步行；「何分ぐらい」询问大概几分钟。",
    },
    {
      purpose: "没听清时继续交流",
      line: repeat,
      note: "不必假装听懂。「もう一度」请求再说一次，「ゆっくり」请求放慢速度。",
    },
  ],
  responsePrompts: [
    {
      id: "respond-confirm",
      title: "确认方向，再问多久",
      context:
        "路人告诉你在第二个路口右转。复述确认这个方向，再问步行大约多久。",
      cue: directions,
      goals: ["确认第二个路口右转", "询问步行时间"],
      references: [
        l(
          [
            r("二", "ふた"),
            "つ",
            r("目", "め"),
            "の",
            r("角", "かど"),
            "を",
            r("右", "みぎ"),
            "ですね。",
            r("歩", "ある"),
            "いて",
            r("何分", "なんぷん"),
            "ぐらいですか。",
          ],
          "futatsume no kado o migi desu ne. aruite nanpun gurai desu ka.",
          "是在第二个路口向右吧。走路大约几分钟？",
        ),
        l(
          [
            r("二", "ふた"),
            "つ",
            r("目", "め"),
            "の",
            r("角", "かど"),
            "で",
            r("右", "みぎ"),
            "に",
            r("曲", "ま"),
            "がるんですね。",
            r("歩", "ある"),
            "いてどのくらいかかりますか。",
          ],
          "futatsume no kado de migi ni magaru n desu ne. aruite dono kurai kakarimasu ka.",
          "在第二个路口右转，对吧？步行大概要多久？",
        ),
      ],
    },
    {
      id: "respond-repeat",
      title: "没听清，请对方再说",
      context: "路人说得有些快，你没有听清。礼貌地请对方慢一点再说一遍。",
      cue: location,
      goals: ["礼貌说明需要重复", "请求慢一点"],
      references: [
        repeat,
        l(
          [
            "すみません。もう",
            r("一度", "いちど"),
            "ゆっくり",
            r("言", "い"),
            "っていただけますか。",
          ],
          "sumimasen. mou ichido yukkuri itte itadakemasu ka.",
          "不好意思，可以再慢一点说一遍吗？",
        ),
      ],
    },
  ],
  transferPrompt: {
    id: "transfer-station",
    title: "这次要去车站",
    context: "你现在想去车站。向路人询问车站的位置，并问走路大约几分钟。",
    cue: null,
    goals: ["礼貌问车站在哪里", "询问步行时间"],
    references: [
      l(
        [
          "すみません。",
          r("駅", "えき"),
          "はどこですか。",
          r("歩", "ある"),
          "いて",
          r("何分", "なんぷん"),
          "ぐらいですか。",
        ],
        "sumimasen. eki wa doko desu ka. aruite nanpun gurai desu ka.",
        "不好意思，车站在哪里？走路大约几分钟？",
      ),
      l(
        [
          "すみません。",
          r("駅", "えき"),
          "への",
          r("行", "い"),
          "き",
          r("方", "かた"),
          "を",
          r("教", "おし"),
          "えてください。",
          r("歩", "ある"),
          "いてどのくらいかかりますか。",
        ],
        "sumimasen. eki e no ikikata o oshiete kudasai. aruite dono kurai kakarimasu ka.",
        "不好意思，请告诉我去车站怎么走。走路大约要多久？",
      ),
    ],
  },
  readingSender: "図書館",
  readingLabel: "入口告示",
  readingMessage: l(
    [
      r("開館時間", "かいかんじかん"),
      "は",
      r("午前九時", "ごぜんくじ"),
      "から",
      r("午後六時", "ごごろくじ"),
      "までです。",
      r("月曜日", "げつようび"),
      "は",
      r("休", "やす"),
      "みです。",
      r("本", "ほん"),
      "の",
      r("返却", "へんきゃく"),
      "は",
      r("入口", "いりぐち"),
      "の",
      r("右側", "みぎがわ"),
      "です。",
    ],
    "kaikan jikan wa gozen kuji kara gogo rokuji made desu. getsuyoubi wa yasumi desu. hon no henkyaku wa iriguchi no migigawa desu.",
    "开放时间是上午9点到下午6点。周一休馆。还书处在入口右侧。",
  ),
  readingQuestions: [
    {
      id: "read-closing",
      prompt: "图书馆几点关门？",
      options: ["上午九点", "下午六点", "晚上九点"],
      correct: 1,
      explanation:
        "「午後六時まで」是到下午六点为止。「から〜まで」表示从某个时间到某个时间。",
    },
    {
      id: "read-day",
      prompt: "哪一天不开放？",
      options: ["周一", "周六", "周日"],
      correct: 0,
      explanation:
        "「月曜日は休み」表示星期一休息。「月曜日」不是每个月的某一天。",
    },
  ],
};

const blue = l(
  [
    "すみません。このシャツの",
    r("青", "あお"),
    "い",
    r("色", "いろ"),
    "はありますか。",
  ],
  "sumimasen. kono shatsu no aoi iro wa arimasu ka.",
  "不好意思，这件衬衫有蓝色的吗？",
);
const sizes = l(
  ["はい。サイズはMとLがあります。"],
  "hai. saizu wa emu to eru ga arimasu.",
  "有的。有M码和L码。",
);
const tryOn = l(
  ["Mサイズを", r("試着", "しちゃく"), "してもいいですか。"],
  "emu saizu o shichaku shite mo ii desu ka.",
  "可以试穿M码吗？",
);
const fittingRoom = l(
  ["もちろんです。", r("試着室", "しちゃくしつ"), "はあちらです。"],
  "mochiron desu. shichakushitsu wa achira desu.",
  "当然可以。试衣间在那边。",
);
const smaller = l(
  [
    "ちょっと",
    r("大", "おお"),
    "きいです。もう",
    r("少", "すこ"),
    "し",
    r("小", "ちい"),
    "さいサイズはありますか。",
  ],
  "chotto ookii desu. mou sukoshi chiisai saizu wa arimasu ka.",
  "有点大。有小一点的尺码吗？",
);
const card = l(
  ["これをください。カードで", r("払", "はら"), "えますか。"],
  "kore o kudasai. kaado de haraemasu ka.",
  "我要这件。可以刷卡吗？",
);

export const shoppingCourse: ScenarioDefinition = {
  id: "clothes-shopping-v1",
  title: "买衣服与询问尺码",
  objective: "问颜色和尺码、请求试穿，读懂价格与付款方式。",
  listeningHeading: "服装店里的问答",
  listeningFocus: "颜色、尺码和试穿请求",
  readingFocus: "两件的价格和付款方式",
  readingWords: ["二枚", "現金", "使えます"],
  transferFocus: "换颜色、尺码并询问付款",
  dialogue: [
    { speaker: "你", line: blue },
    { speaker: "店员", line: sizes },
    { speaker: "你", line: tryOn },
    { speaker: "店员", line: fittingRoom },
  ],
  listeningQuestions: [
    {
      id: "listen-color",
      prompt: "客人在找什么颜色？",
      options: ["白色", "蓝色", "黑色"],
      correct: 1,
      explanation: "「青い色」是蓝色。「白い」是白色，「黒い」是黑色。",
    },
    {
      id: "listen-size",
      prompt: "客人想试穿哪个尺码？",
      options: ["S码", "L码", "M码"],
      correct: 2,
      explanation: "「Mサイズを試着してもいいですか」是在请求试穿M码。",
    },
    {
      id: "listen-permission",
      prompt: "店员如何回应试穿请求？",
      options: ["可以，试衣间在那边", "不能试穿", "要先付款"],
      correct: 0,
      explanation:
        "「もちろんです」表示当然可以，随后说明「試着室」即试衣间的位置。",
    },
  ],
  expressions: [
    {
      purpose: "询问有没有某种颜色",
      line: blue,
      note: "「〜はありますか」询问有没有某种商品、颜色或尺码。",
    },
    {
      purpose: "请求试穿",
      line: tryOn,
      note: "「〜てもいいですか」用于请求许可。试穿是「試着する」。",
    },
    {
      purpose: "说明不合适",
      line: smaller,
      note: "「ちょっと大きい」是有点大；「もう少し小さい」是再小一点。",
    },
    {
      purpose: "购买并询问付款",
      line: card,
      note: "「これをください」表示要购买眼前这件；「カードで」表示用银行卡付款。",
    },
  ],
  responsePrompts: [
    {
      id: "respond-try",
      title: "请求试穿M码",
      context: "店员说有M码和L码。你想先试穿M码，向店员提出请求。",
      cue: sizes,
      goals: ["说明要M码", "请求试穿许可"],
      references: [
        tryOn,
        l(
          ["Mサイズを", r("試着", "しちゃく"), "したいんですが、いいですか。"],
          "emu saizu o shichaku shitai n desu ga, ii desu ka.",
          "我想试穿M码，可以吗？",
        ),
      ],
    },
    {
      id: "respond-size",
      title: "太大了，换小一点",
      context: "试穿后觉得衣服有点大。告诉店员，并询问有没有小一点的尺码。",
      cue: null,
      goals: ["说明衣服有点大", "询问更小的尺码"],
      references: [
        smaller,
        l(
          [
            "これは",
            r("少", "すこ"),
            "し",
            r("大", "おお"),
            "きいので、",
            r("小", "ちい"),
            "さいサイズはありますか。",
          ],
          "kore wa sukoshi ookii node, chiisai saizu wa arimasu ka.",
          "这件有点大，有小一点的尺码吗？",
        ),
      ],
    },
  ],
  transferPrompt: {
    id: "transfer-buy",
    title: "买一件白色L码T恤",
    context: "这次想买一件白色L码T恤，并确认能否用银行卡付款。",
    cue: null,
    goals: ["白色T恤", "L码一件", "询问能否刷卡"],
    references: [
      l(
        [
          r("白", "しろ"),
          "いTシャツのLサイズを",
          r("一枚", "いちまい"),
          "ください。カードで",
          r("払", "はら"),
          "えますか。",
        ],
        "shiroi tii shatsu no eru saizu o ichimai kudasai. kaado de haraemasu ka.",
        "请给我一件白色L码T恤。可以刷卡吗？",
      ),
      l(
        [
          "Lサイズの",
          r("白", "しろ"),
          "いTシャツを",
          r("一枚", "いちまい"),
          "お",
          r("願", "ねが"),
          "いします。クレジットカードは",
          r("使", "つか"),
          "えますか。",
        ],
        "eru saizu no shiroi tii shatsu o ichimai onegai shimasu. kurejitto kaado wa tsukaemasu ka.",
        "请给我一件L码白色T恤。能用信用卡吗？",
      ),
    ],
  },
  readingSender: "衣料品店",
  readingLabel: "价格牌",
  readingMessage: l(
    [
      "Tシャツは",
      r("一枚二千円", "いちまいにせんえん"),
      "、",
      r("二枚", "にまい"),
      "で",
      r("三千五百円", "さんぜんごひゃくえん"),
      "です。",
      r("現金", "げんきん"),
      "とクレジットカードが",
      r("使", "つか"),
      "えます。",
    ],
    "tii shatsu wa ichimai nisen en, nimai de sanzen gohyaku en desu. genkin to kurejitto kaado ga tsukaemasu.",
    "T恤一件2000日元，两件3500日元。可以使用现金和信用卡。",
  ),
  readingQuestions: [
    {
      id: "read-total",
      prompt: "买两件T恤共多少钱？",
      options: ["2000日元", "4000日元", "3500日元"],
      correct: 2,
      explanation:
        "价格牌直接写明「二枚で三千五百円」，两件合计3500日元，而不是把单件价格直接乘二。",
    },
    {
      id: "read-payment",
      prompt: "可以用信用卡付款吗？",
      options: ["可以，也接受现金", "不可以，只收现金", "只能用信用卡"],
      correct: 0,
      explanation:
        "「現金とクレジットカードが使えます」表示两种付款方式都能使用。",
    },
  ],
};
