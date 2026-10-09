import React from "react";
import { inputChunks, type InputChunk } from "../../src/kana.ts";

export default function KanaAnnotation({
  text,
  annotate = true,
  kinds,
  onInspect,
}: {
  text: string;
  annotate?: boolean;
  kinds?: string[];
  onInspect?: (chunk: InputChunk) => void;
}): React.JSX.Element {
  return (
    <span className="kana-annotation" lang="ja">
      {inputChunks(text).map((chunk) => {
        const content = (
          <ruby>
            <span>
              {[...chunk.text].map((char, offset) => (
                <span
                  key={offset}
                  className={
                    kinds
                      ? `diff-${kinds[chunk.start + offset] ?? "match"}`
                      : undefined
                  }
                >
                  {char}
                </span>
              ))}
            </span>
            {annotate && chunk.keys ? <rt>{chunk.keys}</rt> : null}
          </ruby>
        );
        return onInspect && chunk.keys ? (
          <button
            type="button"
            className="annotation-chunk"
            key={chunk.start}
            title={`查看 ${chunk.text} 的输入方法`}
              aria-label={`查看 ${chunk.text} 的输入方法`}
            onClick={() => onInspect(chunk)}
          >
            {content}
          </button>
        ) : (
          <span key={chunk.start}>{content}</span>
        );
      })}
    </span>
  );
}
