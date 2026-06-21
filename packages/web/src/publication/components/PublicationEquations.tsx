import { isRowComment, type EquationListItem } from "@sfcr/notebook-core";

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

        return (
          <div key={item.id} className="publication-equation-block">
            <div className="publication-equation-expression">
              <span className="publication-equation-formula">
                <PublicationVariableName interaction={interaction} name={item.name} />
                {" = "}
                {renderPublicationFormula(expression, interaction)}
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
