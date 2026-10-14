import { useMemo, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Headphones,
  MessageCircle,
  Repeat2,
} from "lucide-react";
import { getScenario, scenarioCourses } from "./catalogue.ts";
import {
  recommendedCourse,
  targetTitle,
  type LearningLibrary,
  type PracticeTarget,
} from "./library.ts";
import { supportLabels, type Support } from "./progress.ts";
import { formatAttemptDate } from "./LearningHome.tsx";
import { findVariant } from "./variants.ts";
import { revisitPlans } from "./revisit.ts";
import {
  buildPracticeEvidence,
  dimensions,
  dimensionLabels,
  type Dimension,
  type DimensionEvidence,
  type EvidenceItem,
  type EvidencePeriod,
  type EvidenceSource,
} from "./evidence.ts";
import "./radar.css";

const icons = {
  listening: Headphones,
  response: MessageCircle,
  transfer: Repeat2,
  reading: BookOpen,
};
const ratings = {
  independent: "自评能独立表达",
  assisted: "自评需要参考",
  again: "自评还想练习",
};
const axes = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];
function point(index: number, percent: number): string {
  const [x, y] = axes[index];
  return `${180 + x * percent},${164 + y * percent}`;
}
function Radar({ data }: { data: Record<Dimension, DimensionEvidence> }) {
  const complete = dimensions.every((id) => data[id].percent !== null);
  const labels = [
    [180, 27],
    [316, 151],
    [180, 299],
    [44, 151],
  ];
  return (
    <svg
      className="practice-radar-chart"
      viewBox="0 0 360 328"
      role="img"
      aria-label="四维练习雷达"
    >
      <title>独立完成的练习记录，不是语言能力评分</title>
      <desc>
        {dimensions
          .map(
            (id) =>
              `${dimensionLabels[id]}：${data[id].percent === null ? "待积累" : `${data[id].percent}%`}`,
          )
          .join("；")}
        。口语为自评，缺少记录的维度不绘制数据点。
      </desc>
      {[25, 50, 75, 100].map((percent) => (
        <polygon
          key={percent}
          points={axes.map((_, i) => point(i, percent)).join(" ")}
          className="radar-grid"
        />
      ))}
      {axes.map((_, i) => (
        <line
          key={i}
          x1="180"
          y1="164"
          x2={180 + axes[i][0] * 100}
          y2={164 + axes[i][1] * 100}
          className="radar-grid"
        />
      ))}
      <text x="185" y="179" className="radar-scale">
        0
      </text>
      <text x="185" y="117" className="radar-scale">
        50
      </text>
      <text x="185" y="66" className="radar-scale">
        100%
      </text>
      {complete && (
        <polygon
          className="radar-shape"
          points={dimensions
            .map((id, i) => point(i, data[id].percent!))
            .join(" ")}
        />
      )}
      {dimensions.map((id, i) => {
        const percent = data[id].percent;
        const [x, y] = labels[i];
        return (
          <g key={id}>
            {percent !== null && (
              <circle
                className="radar-point"
                data-dimension={id}
                cx={180 + axes[i][0] * percent}
                cy={164 + axes[i][1] * percent}
                r="4"
              />
            )}
            <text x={x} y={y} textAnchor="middle" className="radar-label">
              {dimensionLabels[id]}
            </text>
            <text x={x} y={y + 19} textAnchor="middle" className="radar-value">
              {percent === null ? "待积累" : `${percent}%`}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
function itemOutcome(item: EvidenceItem): string {
  if (item.rating) return ratings[item.rating];
  return !item.correct
    ? "答错"
    : item.independent
      ? "无提示答对"
      : "借助辅助答对";
}
function summary(data: DimensionEvidence): string {
  const total = data.items.length;
  if (!total) return "尚无已完成的练习记录";
  return data.id === "listening" || data.id === "reading"
    ? `答对 ${data.correct} / ${total} 题 · 无提示答对 ${data.independent} 题`
    : `自评独立表达 ${data.independent} / ${total} 项`;
}

export default function PracticeRadar({
  library,
  onFocus,
  onCourse,
  onAttempt,
  onRevisit,
}: {
  library: LearningLibrary;
  onFocus: (target: PracticeTarget) => void;
  onCourse: (id: string) => void;
  onAttempt: (index: number) => void;
  onRevisit: (baseId: string) => void;
}) {
  const [period, setPeriod] = useState<EvidencePeriod>("recent");
  const [selected, setSelected] = useState<Dimension>("listening");
  const [source, setSource] = useState<EvidenceSource>("course");
  const evidence = useMemo(
    () => buildPracticeEvidence(library, period, Date.now(), source),
    [library, period, source],
  );
  const data = evidence.dimensions[selected];
  const spoken = selected === "response" || selected === "transfer";
  const supports = Object.entries(data.supportCounts) as [Support, number][];
  const target = data.target;
  const variant = target ? findVariant(target.lessonId) : undefined;
  const nextVariant =
    source !== "course" ? revisitPlans(library)[0] : undefined;
  return (
    <section className="practice-evidence" aria-label="练习雷达">
      <div className="evidence-heading">
        <div>
          <span className="scenario-eyebrow">日常交流与阅读</span>
          <h2>练习雷达</h2>
        </div>
        <div className="segmented" role="group" aria-label="记录时间范围">
          <button
            type="button"
            aria-pressed={period === "recent"}
            onClick={() => setPeriod("recent")}
          >
            最近 30 天
          </button>
          <button
            type="button"
            aria-pressed={period === "all"}
            onClick={() => setPeriod("all")}
          >
            全部记录
          </button>
        </div>
      </div>
      <div className="evidence-source">
        <span>记录来源</span>
        <div className="segmented" role="group" aria-label="练习记录来源">
          {(
            [
              ["course", "原课练习"],
              ["variant", "全部变体"],
              ["delayed", "隔日复测"],
            ] as const
          ).map(([value, label]) => (
            <button
              type="button"
              key={value}
              aria-pressed={source === value}
              onClick={() => setSource(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <p className="evidence-caption">
        独立完成比例 · 理解题按答案统计，口语按自评统计；不是语言能力等级。
      </p>
      <p className="evidence-coverage">
        {evidence.attemptCount} 次已完成练习 <span>·</span> 覆盖{" "}
        {evidence.courseCount} / {scenarioCourses.length} 个情景
      </p>
      <div className="evidence-overview">
        <Radar data={evidence.dimensions} />
        <div className="evidence-dimensions" role="group" aria-label="练习维度">
          {dimensions.map((id) => {
            const value = evidence.dimensions[id];
            const Icon = icons[id];
            return (
              <button
                type="button"
                key={id}
                aria-label={`查看${dimensionLabels[id]}依据`}
                aria-pressed={selected === id}
                aria-controls="practice-evidence-detail"
                onClick={() => setSelected(id)}
              >
                <Icon size={20} aria-hidden="true" />
                <span className="evidence-dimension-copy">
                  <strong>
                    {dimensionLabels[id]}
                    <small>
                      {id === "response" || id === "transfer"
                        ? "口语自评"
                        : "理解题"}
                    </small>
                  </strong>
                  <span>{summary(value)}</span>
                </span>
                <b>{value.percent === null ? "待积累" : `${value.percent}%`}</b>
              </button>
            );
          })}
        </div>
      </div>
      <p className="evidence-method">
        同一情景的同一题，只取所选时段最近一次已完成的结果。未完成练习不计入；缺少记录不按
        0% 处理。
      </p>
      {evidence.textOnlyCount > 0 && (
        <p className="evidence-notice">
          有 {evidence.textOnlyCount}{" "}
          次对话文字理解记录未完整播放音频，未计入听力维度。
        </p>
      )}
      <section
        id="practice-evidence-detail"
        className="evidence-detail"
        aria-label={`${dimensionLabels[selected]}依据`}
      >
        <div className="evidence-detail-heading">
          <h3>
            {dimensionLabels[selected]}{" "}
            <span>{spoken ? "口语自评" : "理解题结果"}</span>
          </h3>
          <span className="muted">
            {data.courseCount === 0
              ? "待积累"
              : data.courseCount === 1
                ? "仅 1 个情景，样本较少"
                : `${data.courseCount} 个情景的练习记录`}
          </span>
        </div>
        <p className="evidence-result">{summary(data)}</p>
        {data.items.length > 0 && (
          <>
            <p className="muted">
              {spoken
                ? `需要参考 ${data.assisted} 项 · 还想练习 ${data.again} 项`
                : `借助辅助答对 ${data.correct - data.independent} 题 · 答错 ${data.items.length - data.correct} 题`}
            </p>
            <p className="evidence-meta">
              {data.attemptCount} 次已完成练习 · 最近练习{" "}
              <time dateTime={data.lastPracticedAt!}>
                {formatAttemptDate(data.lastPracticedAt!)}
              </time>
            </p>
            {!spoken && (
              <p className="evidence-supports">
                作答前辅助：
                {supports.length
                  ? supports
                      .map(
                        ([support, count]) =>
                          `${supportLabels[support]} ${count} 题`,
                      )
                      .join(" · ")
                  : data.unknownSupports === data.items.length
                    ? "旧记录未保存逐题详情"
                    : "有详情的记录未使用辅助"}
                {data.unknownSupports > 0 &&
                data.unknownSupports < data.items.length
                  ? `；另有 ${data.unknownSupports} 题无逐题详情`
                  : ""}
              </p>
            )}
            {spoken && (
              <p className="evidence-meta">
                基于你对表达要点的自评，不含自动发音或语法评分。
              </p>
            )}
            <details
              className="evidence-items"
              key={`${source}-${period}-${selected}`}
            >
              <summary>逐题依据（{data.items.length} 项）</summary>
              <ul>
                {data.items.map((item) => (
                  <li key={`${item.target.lessonId}/${item.id}`}>
                    <div>
                      <strong>
                        {getScenario(item.target.lessonId).title} · {item.title}
                      </strong>
                      <span>
                        {itemOutcome(item)} ·{" "}
                        {formatAttemptDate(item.completedAt)}
                      </span>
                      {item.correct !== null && (
                        <small>
                          {item.supports
                            ? item.supports.length
                              ? `辅助：${item.supports.map((support) => supportLabels[support]).join("、")}`
                              : "辅助：无"
                            : "逐题辅助详情未记录"}
                        </small>
                      )}
                    </div>
                    <button
                      type="button"
                      className="home-link"
                      aria-label={`回看记录：${getScenario(item.target.lessonId).title}，${item.title}`}
                      onClick={() => onAttempt(item.attemptIndex)}
                    >
                      回看记录
                      <ArrowRight size={15} />
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          </>
        )}
        <div className="evidence-practice">
          {library.revisit ? (
            <>
              <div>
                <strong>有一组变体尚未完成</strong>
                <p>{getScenario(library.revisit.variantId).title}</p>
              </div>
              <button
                type="button"
                className="home-primary"
                onClick={() => onRevisit(library.revisit!.baseId)}
              >
                继续变体练习
                <ArrowRight size={17} />
              </button>
            </>
          ) : library.focus ? (
            <>
              <div>
                <strong>有一项练习尚未完成</strong>
                <p>
                  {getScenario(library.focus.lessonId).title} ·{" "}
                  {targetTitle(library.focus)}
                </p>
              </div>
              <button
                type="button"
                className="home-primary"
                onClick={() => onFocus(library.focus!)}
              >
                继续未完成练习
                <ArrowRight size={17} />
              </button>
            </>
          ) : target ? (
            <>
              <div>
                <strong>
                  {data.independent === data.items.length
                    ? "再试一次，看看能否保持"
                    : "下一项重练"}
                </strong>
                <p>
                  {getScenario(target.lessonId).title} · {targetTitle(target)}
                </p>
              </div>
              <button
                type="button"
                className="home-primary"
                onClick={() =>
                  variant ? onRevisit(variant.baseId) : onFocus(target)
                }
              >
                {variant ? "再练这组变体" : `再练${dimensionLabels[selected]}`}
                <ArrowRight size={17} />
              </button>
            </>
          ) : nextVariant ? (
            <>
              <div>
                <strong>在熟悉场景里换一种说法</strong>
                <p>{getScenario(nextVariant.baseId).title}</p>
              </div>
              <button
                type="button"
                className="home-primary"
                onClick={() => onRevisit(nextVariant.baseId)}
              >
                练习同场景变体
                <ArrowRight size={17} />
              </button>
            </>
          ) : (
            <>
              <div>
                <strong>从一轮完整情景练习开始</strong>
                <p>{getScenario(recommendedCourse(library)).title}</p>
              </div>
              <button
                type="button"
                className="home-primary"
                onClick={() => onCourse(recommendedCourse(library))}
              >
                进入推荐课程
                <ArrowRight size={17} />
              </button>
            </>
          )}
        </div>
      </section>
    </section>
  );
}
