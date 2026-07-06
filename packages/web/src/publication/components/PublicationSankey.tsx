import { useMemo } from "react";

import { SankeyDiagramCanvas } from "../../components/SankeyDiagramCanvas";
import { resolveSankeyDiagram } from "../../notebook/sankey";
import type { MatrixCell, NotebookCell, SankeyCell } from "../../notebook/types";

export function PublicationSankey({
  cell,
  cells,
  getResult,
  selectedPeriodIndex
}: {
  cell: SankeyCell;
  cells: NotebookCell[];
  getResult(runCellId: string): import("@sfcr/core").SimulationResult | null;
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
        (cellId) => getResult(cellId),
        selectedPeriodIndex
      ),
    [cell, cells, getResult, selectedPeriodIndex]
  );

  const sourceMatrix = useMemo((): MatrixCell | null => {
    if (cell.source.kind !== "matrix") {
      return null;
    }
    const target = cells.find((entry) => entry.id === cell.source.matrixCellId);
    return target?.type === "matrix" ? target : null;
  }, [cell.source, cells]);

  return (
    <div className="publication-sankey">
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
