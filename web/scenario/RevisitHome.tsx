import { useEffect, useState } from "react";
import { ArrowRight, CalendarClock } from "lucide-react";
import { getScenario } from "./catalogue.ts";
import type { LearningLibrary, PracticeTarget } from "./library.ts";
import { targetTitle } from "./library.ts";
import { revisitPlans } from "./revisit.ts";
import { formatRevisitTime } from "./RevisitLesson.tsx";

export default function RevisitHome({
  library,
  onRevisit,
  onFocus,
}: {
  library: LearningLibrary;
  onRevisit: (baseId: string) => void;
  onFocus: (target: PracticeTarget) => void;
}) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  const plans = revisitPlans(library, now);
  const due = plans.filter((plan) => plan.due);
  const pending = library.revisit;
  if (!plans.length && !pending) return null;
  const next = due[0] ?? plans[0];
  return (
    <section className="home-revisit" aria-label="隔日再测">
      <div className="home-section-heading">
        <h2>
          <CalendarClock size={18} />
          隔日再测
        </h2>
        <span className="muted">
          {due.length ? `${due.length} 个情景到期` : "暂无到期情景"}
        </span>
      </div>
      {pending || due.length ? (
        <div className="home-goal-body">
          <div>
            <h3>{getScenario(pending?.baseId ?? next.baseId).title}</h3>
            <p>
              {pending
                ? `接着上次：${getScenario(pending.variantId).title}`
                : "换一段对话、换一组条件，再试着听懂和回应。"}
            </p>
            <span className="muted">
              {pending
                ? "未完成的变体练习已保留"
                : next.variantRuns
                  ? `材料 B · 已练过 ${next.variantRuns} 次，不是全新材料`
                  : "材料 B · 首次练习"}
            </span>
          </div>
          <button
            type="button"
            className="home-primary"
            onClick={() =>
              library.focus
                ? onFocus(library.focus)
                : onRevisit(pending?.baseId ?? next.baseId)
            }
          >
            {library.focus
              ? "继续未完成单项练习"
              : pending
                ? "继续变体练习"
                : "开始到期复测"}
            <ArrowRight size={18} />
          </button>
        </div>
      ) : (
        <p className="revisit-next">
          下一次：{getScenario(next.baseId).title} ·{" "}
          <time dateTime={next.dueAt}>{formatRevisitTime(next.dueAt)}</time>
        </p>
      )}
      {library.focus && (
        <p className="muted">
          先完成已开始的单项练习：{targetTitle(library.focus)}。
        </p>
      )}
      <details className="revisit-schedule">
        <summary>复测安排 · {plans.length} 个情景</summary>
        <p className="revisit-policy">
          独立完成后按 1、3、7、14 天逐步延长，需要辅助时回到 1 天。间隔按完整
          24 小时计算，只是练习安排，不代表已掌握。
        </p>
        <p className="revisit-policy">
          提前练习、温习原课或回看答案后重新计时。材料 B
          是固定编排；重复练习不算新材料。
        </p>
        <ul>
          {plans.map((plan) => (
            <li key={plan.baseId}>
              <div>
                <strong>{getScenario(plan.baseId).title}</strong>
                <span>
                  {plan.due ? "已到期" : "下次"} ·{" "}
                  {formatRevisitTime(plan.dueAt)} · 间隔 {plan.intervalDays} 天
                </span>
                <small>
                  隔日复测 {plan.delayedRuns} 次 · 材料 B 已练{" "}
                  {plan.variantRuns} 次
                </small>
              </div>
              <button
                type="button"
                className="home-link"
                aria-label={`练习变体：${getScenario(plan.baseId).title}`}
                disabled={!!pending || !!library.focus}
                onClick={() => onRevisit(plan.baseId)}
              >
                {plan.due ? "到期复测" : "提前练变体"}
                <ArrowRight size={16} />
              </button>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
