import { usesMatrixAccountColumnLayout } from "@sfcr/notebook-core";

import { resolveMatrixCornerLabel, resolveMatrixTableKind } from "../../notebook/matrixSemantics";
import { isEmptyAccountSumRowSource } from "../../notebook/matrixAccountSumRow";
import type { MatrixCell } from "../../notebook/types";
import type { PublicationVariableInteraction } from "../publicationInspect";
import { renderPublicationFormula } from "../publicationFormula";

function formatPublicationMatrixEntry(source: string, interaction: PublicationVariableInteraction) {
  const trimmed = source.trim();
  if (!trimmed || isEmptyAccountSumRowSource(trimmed)) {
    return trimmed === "0" ? "0" : "";
  }

  return (
    <span className="publication-matrix-entry">{renderPublicationFormula(trimmed, interaction)}</span>
  );
}

export function PublicationMatrix({
  cell,
  interaction
}: {
  cell: MatrixCell;
  interaction: PublicationVariableInteraction;
}) {
  const accountColumnLayout = usesMatrixAccountColumnLayout(cell.columnBadges);
  const matrixKind = resolveMatrixTableKind(cell);
  const cornerLabel = resolveMatrixCornerLabel(accountColumnLayout, matrixKind);

  return (
    <div className="publication-matrix-wrap">
      <table className="publication-matrix">
        <thead>
          <tr>
            <th scope="col">{cornerLabel}</th>
            {cell.columns.map((column) => (
              <th key={column} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cell.rows.map((row) => (
            <tr key={`${row.label}-${row.band ?? ""}`}>
              <th scope="row">{row.label}</th>
              {row.values.map((source, columnIndex) => (
                <td key={`${row.label}-${columnIndex}`}>
                  {formatPublicationMatrixEntry(source, interaction)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
