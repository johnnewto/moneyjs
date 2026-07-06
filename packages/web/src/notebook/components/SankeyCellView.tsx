import { useMemo } from "react";

import { SankeyDiagramCanvas } from "../../components/SankeyDiagramCanvas";
import { resolveSankeyDiagram } from "../sankey";
import type { MatrixCell, NotebookCell, SankeyCell } from "../types";
import type { useNotebookRunner } from "../useNotebookRunner";

export function SankeyCellView({
  cell,
  cells,
  runner,
  selectedPeriodIndex
}: {
  cell: SankeyCell;
  cells: NotebookCell[];
  runner: ReturnType<typeof useNotebookRunner>;
  selectedPeriodIndex: number;
}) {
  const diagram = useMemo(
    () =>
      resolveSankeyDiagram(
        cell,
        (cellId) => {
          const target = cells.find((entry) => entry.id === cellId);
          return target?.type === "matrix" ? target : null;
        },
        (cellId) => runner.getResult(cellId),
        selectedPeriodIndex
      ),
    [cell, cells, runner, selectedPeriodIndex]
  );

  const sourceMatrix = useMemo((): MatrixCell | null => {
    if (cell.source.kind !== "matrix") {
      return null;
    }
    const target = cells.find((entry) => entry.id === cell.source.matrixCellId);
    return target?.type === "matrix" ? target : null;
  }, [cell.source, cells]);

  return (
    <div className="sankey-cell-view">
      {sourceMatrix ? (
        <p className="sankey-cell-caption">
          Auto-generated from matrix <strong>{sourceMatrix.title}</strong> at period{" "}
          {selectedPeriodIndex + 1}.
        </p>
      ) : null}
      <SankeyDiagramCanvas diagram={diagram} />
    </div>
  );
}
