import { useMemo, useState, type MouseEvent } from "react";

import { isRowComment, type EquationListItem } from "@sfcr/notebook-core";

import {
  buildActiveTrace,
  buildTraceModel,
  togglePinnedTrace,
  type PinnedTrace
} from "../../components/EquationTrace";
import type { EquationsCell, ModelCell, NotebookCell } from "../../notebook/types";
import type { PublicationVariableInteraction } from "../publicationInspect";
import { PublicationVariableName, renderPublicationFormula } from "../publicationFormula";

function resolveEquationItems(cell: NotebookCell): EquationListItem[] {
  if (cell.type === "equations") {
    return cell.equations;
  }
  if (cell.type === "model") {
    return cell.editor.equations;
  }
  return [];
}

export function PublicationEquations({
  cell,
  interaction
}: {
  cell: EquationsCell | ModelCell;
  interaction: PublicationVariableInteraction;
}) {
  const items = resolveEquationItems(cell);
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);
  const [pinnedTrace, setPinnedTrace] = useState<PinnedTrace | null>(null);
  const traceModel = useMemo(() => buildTraceModel(items), [items]);
  const activeTrace = pinnedTrace
    ? buildActiveTrace(traceModel, pinnedTrace.rowId, pinnedTrace.mode)
    : hoveredRowId
      ? buildActiveTrace(traceModel, hoveredRowId, "both")
      : null;

  function handleRowClick(rowId: string, event: MouseEvent<HTMLDivElement>): void {
    if ((event.target as HTMLElement | null)?.closest("button, a")) {
      return;
    }
    setPinnedTrace((current) => togglePinnedTrace(current, rowId, event));
  }

  return (
    <div className="publication-equations">
      {items.map((item, index) => {
        if (isRowComment(item)) {
          const text = item.text.trim();
          if (!text) {
            return null;
          }
          return (
            <p key={item.id ?? `comment-${index}`} className="publication-equations-section">
              {text}
            </p>
          );
        }

        const expression = item.expression.trim();
        if (!expression) {
          return null;
        }

        const traceRole = activeTrace?.rowStates.get(item.id) ?? null;
        const highlightedTokens = traceRole ? activeTrace?.tokenStates : undefined;
        const nameTraceRole = highlightedTokens?.get(item.name.trim()) ?? null;

        return (
          <div
            key={item.id}
            className={[
              "publication-equation-block",
              hoveredRowId === item.id ? "is-hovered" : "",
              traceRole ? `trace-${traceRole}` : ""
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={(event) => handleRowClick(item.id, event)}
            onMouseEnter={() => setHoveredRowId(item.id)}
            onMouseLeave={() => setHoveredRowId(null)}
          >
            <div className="publication-equation-expression">
              <span className="publication-equation-formula">
                <PublicationVariableName
                  interaction={interaction}
                  name={item.name}
                  traceRole={nameTraceRole}
                />
                {" = "}
                {renderPublicationFormula(expression, interaction, highlightedTokens)}
              </span>
            </div>
            {item.desc?.trim() ? (
              <span className="publication-equation-description">{item.desc.trim()}</span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
