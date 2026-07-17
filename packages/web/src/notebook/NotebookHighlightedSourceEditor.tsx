import { useLayoutEffect, useRef } from "react";

import { highlightSourceDraft } from "./sourceEditing";
import type { NotebookCell } from "./types";

export function NotebookHighlightedSourceEditor({
  active = true,
  ariaLabel,
  highlightCellType,
  onChange,
  value
}: {
  active?: boolean;
  ariaLabel: string;
  highlightCellType: NotebookCell["type"];
  onChange(value: string): void;
  value: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const highlightRef = useRef<HTMLPreElement | null>(null);
  const gutterRef = useRef<HTMLPreElement | null>(null);
  const lineNumbers = Array.from({ length: value.split("\n").length }, (_, index) =>
    String(index + 1)
  ).join("\n");

  useLayoutEffect(() => {
    if (!active || !textareaRef.current) {
      return;
    }

    const textarea = textareaRef.current;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 640)}px`;
  }, [active, value]);

  function handleScroll(): void {
    if (!textareaRef.current || !highlightRef.current) {
      return;
    }

    highlightRef.current.scrollTop = textareaRef.current.scrollTop;
    highlightRef.current.scrollLeft = textareaRef.current.scrollLeft;
    if (gutterRef.current) {
      gutterRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  }

  return (
    <div className="notebook-source-codeframe">
      <pre ref={gutterRef} className="notebook-source-gutter" aria-hidden="true">
        <code>{lineNumbers}</code>
      </pre>
      <div className="notebook-source-editor-pane">
        <pre ref={highlightRef} className="notebook-source-highlight" aria-hidden="true">
          {/* Trailing newline matches textarea blank-line metrics (pre drops a lone final \n). */}
          <code>
            {highlightSourceDraft(value, highlightCellType)}
            {"\n"}
          </code>
        </pre>
        <textarea
          ref={textareaRef}
          className="json-area notebook-source-textarea"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onScroll={handleScroll}
          spellCheck={false}
          aria-label={ariaLabel}
        />
      </div>
    </div>
  );
}
