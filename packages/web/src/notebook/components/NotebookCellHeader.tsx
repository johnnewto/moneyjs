import { useEffect, useRef, useState, type ReactNode } from "react";

import { useDragScroll } from "../../hooks/useDragScroll";
import { buildNotebookCellHelpText } from "../sourceEditing";
import type {
  EquationsCell,
  ExternalsCell,
  InitialValuesCell,
  ModelCell,
  SolverCell
} from "../types";

function NotebookHelpButton({
  dialogContent,
  dialogTitle,
  title,
  helpText
}: {
  dialogContent?: ReactNode;
  dialogTitle?: string;
  title: string;
  helpText: string;
}) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const helpDialogDragScroll = useDragScroll<HTMLDivElement>();

  useEffect(() => {
    if (!isDialogOpen || !dialogContent) {
      return;
    }

    function handlePointerDown(event: MouseEvent): void {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (dialogRef.current?.contains(target)) {
        return;
      }

      setIsDialogOpen(false);
    }

    function handleEscape(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setIsDialogOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [dialogContent, isDialogOpen]);

  if (dialogContent) {
    return (
      <>
        <button type="button" className="notebook-run-button" onClick={() => setIsDialogOpen(true)}>
          Help
        </button>
        {isDialogOpen ? (
          <div
            className="notebook-help-dialog-backdrop"
            onClick={() => setIsDialogOpen(false)}
            role="presentation"
          >
            <div
              aria-label={dialogTitle ?? `Help for ${title}`}
              aria-modal="true"
              className="notebook-help-dialog"
              onClick={(event) => event.stopPropagation()}
              ref={dialogRef}
              role="dialog"
            >
              <div className="notebook-help-dialog-header">
                <div>
                  <p className="panel-subtitle">{title}</p>
                  <h3>{dialogTitle ?? "Help"}</h3>
                </div>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setIsDialogOpen(false)}
                >
                  Close
                </button>
              </div>
              <div
                ref={helpDialogDragScroll.dragScrollRef}
                className={`notebook-help-dialog-body ${helpDialogDragScroll.dragScrollProps.className}`}
                onClickCapture={helpDialogDragScroll.dragScrollProps.onClickCapture}
                onMouseDown={helpDialogDragScroll.dragScrollProps.onMouseDown}
              >
                {dialogContent}
              </div>
            </div>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <details className="notebook-cell-help">
      <summary className="notebook-run-button">Help</summary>
      <div className="notebook-cell-help-panel" role="note" aria-label={`Help for ${title}`}>
        {helpText
          .split("\n")
          .filter((line) => line.trim().length > 0)
          .map((line, index) => (
            <p key={`${title}-help-${index}`}>{line}</p>
          ))}
      </div>
    </details>
  );
}

export function NotebookLinkedEditorHeader({
  actions,
  children,
  title,
  typeLabel
}: {
  actions: ReactNode;
  children?: ReactNode;
  title: string;
  typeLabel: string;
}) {
  return (
    <div className="notebook-linked-editor-topline is-compact">
      <div className="notebook-linked-editor-meta">
        <div className="notebook-linked-editor-titleline">
          <span className="notebook-cell-type-tag">{typeLabel}</span>
          <h2>{title}</h2>
        </div>
        {children ?? null}
      </div>
      {actions}
    </div>
  );
}

export function NotebookCellHeaderActions({
  helpDialogContent,
  helpDialogTitle,
  helpText,
  isCollapsed,
  isEditing,
  leadingActions,
  onEditToggle,
  onToggleCollapsed,
  title,
  trailingActions
}: {
  helpDialogContent?: ReactNode;
  helpDialogTitle?: string;
  helpText: string | null;
  isCollapsed: boolean;
  isEditing: boolean;
  leadingActions?: ReactNode;
  onEditToggle?: (() => void) | null;
  onToggleCollapsed: (() => void) | null;
  title: string;
  trailingActions?: ReactNode;
}) {
  return (
    <div className="notebook-cell-header-actions">
      {leadingActions ? <div className="notebook-cell-header-leading">{leadingActions}</div> : null}
      <div className="notebook-linked-editor-actions">
        {!isEditing ? trailingActions ?? null : null}
        {helpText ? (
          <NotebookHelpButton
            dialogContent={helpDialogContent}
            dialogTitle={helpDialogTitle}
            title={title}
            helpText={helpText}
          />
        ) : null}
        {!isCollapsed && onEditToggle && !isEditing ? (
          <button
            type="button"
            className="notebook-run-button"
            aria-pressed={isEditing}
            onClick={onEditToggle}
          >
            Edit
          </button>
        ) : null}
        {onToggleCollapsed ? (
          <button type="button" className="notebook-run-button" onClick={onToggleCollapsed}>
            {isCollapsed ? "Show" : "Hide"}
          </button>
        ) : null}
        {isEditing ? trailingActions ?? null : null}
      </div>
    </div>
  );
}

export function NotebookLinkedEditorActions({
  cell,
  extraActions,
  hasDraftEdits,
  isEditing,
  onApply,
  onCancel,
  onEditToggle,
  onToggleCollapsed,
  title
}: {
  cell: ModelCell | EquationsCell | SolverCell | ExternalsCell | InitialValuesCell;
  extraActions?: ReactNode;
  hasDraftEdits: boolean;
  isEditing: boolean;
  onApply(): void;
  onCancel(): void;
  onEditToggle(): void;
  onToggleCollapsed(): void;
  title: string;
}) {
  return (
    <NotebookCellHeaderActions
      helpDialogContent={
        isEditing && (cell.type === "equations" || cell.type === "model") ? (
          <EquationSyntaxHelpContent />
        ) : undefined
      }
      helpDialogTitle={
        isEditing && (cell.type === "equations" || cell.type === "model")
          ? "Equation Syntax"
          : undefined
      }
      helpText={buildNotebookCellHelpText(cell)}
      isCollapsed={cell.collapsed === true}
      isEditing={isEditing}
      onEditToggle={onEditToggle}
      onToggleCollapsed={onToggleCollapsed}
      title={title}
      trailingActions={
        <>
          {!isEditing ? extraActions ?? null : null}
          {isEditing ? (
            <>
              <button
                type="button"
                className="notebook-run-button notebook-source-toggle"
                onClick={onApply}
                disabled={!hasDraftEdits}
              >
                Apply
              </button>
              <button
                type="button"
                className="notebook-run-button notebook-source-toggle"
                onClick={onCancel}
              >
                Cancel
              </button>
            </>
          ) : null}
        </>
      }
    />
  );
}

function EquationSyntaxHelpContent() {
  return (
    <div className="notebook-help-doc">
      <section>
        <h4>Core Forms</h4>
        <ul className="notebook-help-list">
          <li>`X = A + B` for algebraic equations.</li>
          <li>`lag(X)` or `X[-1]` for the previous-period value.</li>
          <li>`d(X)` for a per-year stock-change term.</li>
          <li>`I(flowExpr)` for stock accumulation, equivalent to `lag(X) + flowExpr * dt` on the equation lhs.</li>
          <li>`dt` for the time step. It is currently `1` year unless changed in the runtime later.</li>
        </ul>
      </section>
      <section>
        <h4>Operators</h4>
        <ul className="notebook-help-list">
          <li>`+`, `-`, `*`, `/`</li>
          <li>Comparisons: `&gt;`, `&gt;=`, `&lt;`, `&lt;=`, `==`, `!=`</li>
          <li>Logical operators: `&&`, `||`</li>
        </ul>
      </section>
      <section>
        <h4>Functions</h4>
        <ul className="notebook-help-list">
          <li>`min(a, b)`, `max(a, b)`</li>
          <li>`abs(x)`, `sqrt(x)`, `pow(x, n)`, `exp(x)`, `log(x)`</li>
          <li>`if (condition) {'{'}expr{'}'} else {'{'}expr{'}'}` for conditional logic</li>
        </ul>
      </section>
      <section>
        <h4>Stock-Flow Guidance</h4>
        <ul className="notebook-help-list">
          <li>Stocks should usually be written as `lag(stock) + increment * dt` or `I(flowExpr)`.</li>
          <li>Use explicit `* dt` when combining a lagged stock with flow terms.</li>
          <li>Use declared units to catch `$ + $/yr` mistakes.</li>
        </ul>
      </section>
      <section>
        <h4>Equation Roles</h4>
        <ul className="notebook-help-list">
          <li>Use the `Role` column to declare how an equation should be interpreted.</li>
          <li>`Accumulation` is for stock updates such as `lag(Mh) + (YD - Cd) * dt`.</li>
          <li>`Identity` is for accounting or closure relations such as `Y = C + I + G`.</li>
          <li>`Definition` is for direct mappings or algebraic definitions such as `rm = rl`.</li>
          <li>`Target` is for desired or notional levels such as `KT = kappa * lag(Y)`.</li>
          <li>`Behavioral` is for decision rules such as `Cd = alpha0 + alpha1 * YD + alpha2 * lag(Mh)`.</li>
          <li>`Auto` leaves the role inferred from the equation structure and description.</li>
        </ul>
      </section>
      <section>
        <h4>Examples</h4>
        <pre className="notebook-help-code">{`YD = Y - TX + lag(r) * lag(Bh)
Mh = lag(Mh) + (YD - Cd) * dt
Bs = I(G + lag(r) * lag(Bs) - TX - lag(r) * lag(Bcb))
if (ER <= BANDt) { exp(v) } else { log(v) }`}</pre>
      </section>
    </div>
  );
}
