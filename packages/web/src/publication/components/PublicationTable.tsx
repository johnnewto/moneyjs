import { equationRowsOnly, externalRowsOnly } from "@sfcr/notebook-core";

import { buildEditorStateForNotebookModel } from "../../notebook/modelSections";
import type { NotebookCell, RunCell, TableCell } from "../../notebook/types";
import type { PublicationVariableInteraction } from "../publicationInspect";
import { PublicationVariableName, renderPublicationFormula } from "../publicationFormula";

function resolveTableEditorState(cells: NotebookCell[], sourceRunCellId: string) {
  const sourceRunCell = cells.find(
    (entry): entry is RunCell => entry.type === "run" && entry.id === sourceRunCellId
  );
  if (!sourceRunCell) {
    return null;
  }

  return buildEditorStateForNotebookModel(
    {
      id: "publication-table",
      title: "Publication table",
      metadata: { version: 1 },
      cells
    },
    sourceRunCell
  );
}

function resolvePublicationTableExpression(
  cells: NotebookCell[],
  sourceRunCellId: string,
  variableName: string
): string | null {
  const editor = resolveTableEditorState(cells, sourceRunCellId);
  if (!editor) {
    return null;
  }

  const equation = equationRowsOnly(editor.equations).find(
    (entry) => entry.name.trim() === variableName.trim()
  );
  if (equation?.expression.trim()) {
    return equation.expression.trim();
  }

  const external = externalRowsOnly(editor.externals).find(
    (entry) => entry.name.trim() === variableName.trim()
  );
  if (external?.valueText.trim()) {
    return external.valueText.trim();
  }

  return null;
}

export function PublicationTable({
  cell,
  cells,
  interaction
}: {
  cell: TableCell;
  cells: NotebookCell[];
  interaction: PublicationVariableInteraction;
}) {
  const rows = cell.variables.map((name) => ({
    name,
    expression: resolvePublicationTableExpression(cells, cell.sourceRunCellId, name)
  }));

  return (
    <div className="publication-table-wrap">
      <table className="publication-table">
        <thead>
          <tr>
            <th scope="col">Variable</th>
            <th scope="col">Equation</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name}>
              <th scope="row">
                <PublicationVariableName interaction={interaction} name={row.name} />
              </th>
              <td>
                {row.expression ? (
                  <span className="publication-table-equation">
                    {renderPublicationFormula(row.expression, interaction)}
                  </span>
                ) : (
                  <span className="publication-table-missing">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
