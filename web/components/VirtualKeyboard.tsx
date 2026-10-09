import React from "react";
import { CornerDownLeft, Delete, Space } from "lucide-react";

const rows = ["1234567890-", "qwertyuiop", "asdfghjkl'", "zxcvbnm"];
export default function VirtualKeyboard({
  sequence = "",
  pending = "",
  pressed = "",
  onKey,
  disabled = false,
}: {
  sequence?: string;
  pending?: string;
  pressed?: string;
  onKey?: (key: string) => void;
  disabled?: boolean;
}): React.JSX.Element {
  const active = sequence.toLowerCase();
  const next = active.startsWith(pending) ? active[pending.length] : undefined;
  return (
    <div className="virtual-keyboard" aria-label="罗马字键盘">
      <div
        className="key-sequence"
        aria-label={sequence ? `按键顺序 ${sequence}` : "按键顺序"}
      >
        {[...sequence].map((key, index) => (
          <kbd
            key={index}
            className={index === pending.length ? "next-key" : ""}
          >
            {key}
          </kbd>
        ))}
      </div>
      {rows.map((row, index) => (
        <div className={`keyboard-row row-${index}`} key={row}>
          {[...row].map((key) => (
            <button
              type="button"
              key={key}
              className={`keyboard-key ${active.includes(key) ? "key-used" : ""} ${key === next ? "key-next" : ""} ${key === pressed ? "key-pressed" : ""}`}
              aria-label={`按键 ${key}`}
              disabled={disabled || !onKey}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => onKey?.(key)}
            >
              {key}
            </button>
          ))}
        </div>
      ))}
      {onKey ? (
        <div className="keyboard-row keyboard-actions">
          <button
            type="button"
            title="退格"
            aria-label="退格"
            disabled={disabled}
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => onKey("Backspace")}
          >
            <Delete size={18} />
          </button>
          <button
            type="button"
            title="空格"
            aria-label="空格"
            disabled={disabled}
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => onKey(" ")}
          >
            <Space size={18} />
          </button>
          <button
            type="button"
            title="提交答案"
            aria-label="提交答案"
            disabled={disabled}
            onClick={() => onKey("Enter")}
          >
            <CornerDownLeft size={18} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
