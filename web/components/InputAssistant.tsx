import React, { useEffect, useMemo, useState } from "react";
import { Plus, Volume2, Search, ChevronDown } from "lucide-react";
import {
  inputCandidates,
  kanaCatalogue,
  KANA_GROUPS,
  rulesFor,
  type InputChunk,
  type KanaGroup,
  type KanaItem,
} from "../../src/kana.ts";
import { useInputLearning } from "../inputLearning.tsx";
import { canSpeak, speak } from "../speech.ts";
import { toKatakana } from "wanakana";

export default function InputAssistant({
  prefix = "",
  inspected,
  onInsert,
  onInspect,
}: {
  prefix?: string;
  inspected: InputChunk | null;
  onInsert?: (kana: string) => void;
  onInspect: (chunk: InputChunk) => void;
}): React.JSX.Element {
  const { preferences } = useInputLearning();
  const [group, setGroup] = useState<KanaGroup>("basic");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (inspected) setOpen(true);
  }, [inspected]);
  const catalogue = useMemo(
    () => kanaCatalogue(preferences.script),
    [preferences.script],
  );
  const items = query.trim()
    ? catalogue.filter(
        (item) =>
          item.kana.includes(query.trim()) ||
          [item.keys, ...item.alternatives].some((key) =>
            key.includes(query.trim().toLowerCase()),
          ),
      )
    : catalogue.filter((item) => item.group === group);
  const candidates = inputCandidates(prefix, preferences.script);
  const slots: (KanaItem | null)[] =
    !query.trim() && group === "basic"
      ? KANA_GROUPS[0].rows.flatMap((row) => {
          const bases: (string | null)[] =
            row === "や ゆ よ"
              ? ["や", null, "ゆ", null, "よ"]
              : row === "わ を ん"
                ? ["わ", null, null, null, "を", "ん"]
                : row.split(" ");
          return bases.map((base) =>
            base
              ? (items.find(
                  (item) =>
                    item.kana ===
                    (preferences.script === "katakana"
                      ? toKatakana(base)
                      : base),
                ) ?? null)
              : null,
          );
        })
      : items;
  const selected = inspected
    ? catalogue.find((item) => item.kana === inspected.text)
    : null;
  function choose(item: KanaItem): void {
    onInspect({
      text: item.kana,
      keys: item.keys,
      start: 0,
      end: item.kana.length,
    });
  }

  return (
    <aside
      className={`input-assistant ${open ? "assistant-open" : ""}`}
      aria-label="假名输入助手"
    >
      <button
        className="assistant-heading"
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span>假名输入助手</span>
        <ChevronDown size={17} />
      </button>
      <div className="assistant-content">
        {inspected ? (
          <div className="kana-detail">
            <div className="kana-detail-head">
              <span lang="ja">{inspected.text}</span>
              <button
                type="button"
                className="icon-button"
                aria-label={`播放 ${inspected.text}`}
                title="播放发音"
                disabled={!canSpeak}
                onClick={() => speak(inspected.text)}
              >
                <Volume2 size={18} />
              </button>
            </div>
            <div className="detail-keys">
              {[
                ...new Set([
                  inspected.keys,
                  ...(selected
                    ? [selected.keys, ...selected.alternatives]
                    : []),
                ]),
              ].map((key) => (
                <button
                  type="button"
                  key={key}
                  title={`使用按键 ${key}`}
                  aria-label={`使用按键 ${key}`}
                  className={inspected.keys === key ? "keys-selected" : ""}
                  onClick={() => onInspect({ ...inspected, keys: key })}
                >
                  <kbd>{key}</kbd>
                </button>
              ))}
            </div>
            {rulesFor(inspected.text).map((rule) => (
              <p key={rule.id} className="rule-text">
                {rule.explanation}
              </p>
            ))}
            {onInsert ? (
              <button
                type="button"
                className="insert-kana"
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => onInsert(inspected.text)}
              >
                <Plus size={15} />
                插入 {inspected.text}
              </button>
            ) : null}
          </div>
        ) : null}
        {candidates.length ? (
          <div className="candidate-list" aria-label="组合候选">
            {candidates.map((item) => (
              <button
                type="button"
                key={item.kana}
                onClick={() => choose(item)}
              >
                <span>{item.kana}</span>
                <small>{item.keys}</small>
              </button>
            ))}
          </div>
        ) : null}
        <label className="kana-search">
          <Search size={16} />
          <input
            aria-label="查找假名或罗马字"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="查找假名或罗马字"
          />
        </label>
        <div className="kana-tabs" role="tablist" aria-label="假名分组">
          {KANA_GROUPS.map((item) => (
            <button
              type="button"
              key={item.id}
              role="tab"
              aria-selected={group === item.id}
              onClick={() => {
                setGroup(item.id);
                setQuery("");
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div
          className={`kana-grid ${!query.trim() && group === "combined" ? "grid-combined" : ""}`}
        >
          {slots.map((item, index) =>
            item ? (
              <button
                type="button"
                key={item.kana}
                className={inspected?.text === item.kana ? "kana-selected" : ""}
                aria-label={`${item.kana} ${item.keys}`}
                onClick={() => choose(item)}
              >
                <span lang="ja">{item.kana}</span>
                <small>{item.keys}</small>
              </button>
            ) : (
              <span className="kana-empty" key={`empty-${index}`} />
            ),
          )}
        </div>
        {!items.length ? (
          <div className="empty-state">没有匹配的假名</div>
        ) : null}
      </div>
    </aside>
  );
}
