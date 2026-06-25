import type { SimulationResult } from "@sfcr/core";
import type { CSSProperties } from "react";

import type { ChartGridCell, NotebookCell } from "../../notebook/types";
import type { PublicationVariableInteraction } from "../publicationInspect";
import { PublicationChart } from "./PublicationChart";

export function PublicationChartGrid({
  cell,
  cells,
  getResult,
  interaction,
  interactive = false,
  selectedPeriodIndex
}: {
  cell: ChartGridCell;
  cells: NotebookCell[];
  getResult(runCellId: string): SimulationResult | null;
  interaction: PublicationVariableInteraction;
  interactive?: boolean;
  selectedPeriodIndex: number;
}) {
  return (
    <div
      className="publication-chart-grid"
      style={
        {
          "--chart-grid-max-columns": Math.max(1, Math.floor(cell.gridColumns))
        } as CSSProperties
      }
    >
      {cell.charts.map((chart) => (
        <figure key={chart.id} className="publication-chart-grid-item">
          {chart.title.trim() ? (
            <figcaption className="publication-chart-grid-caption">{chart.title}</figcaption>
          ) : null}
          <PublicationChart
            cell={chart}
            cells={cells}
            getResult={getResult}
            interaction={interaction}
            interactive={interactive}
            result={getResult(chart.sourceRunCellId)}
            selectedPeriodIndex={selectedPeriodIndex}
          />
        </figure>
      ))}
    </div>
  );
}
