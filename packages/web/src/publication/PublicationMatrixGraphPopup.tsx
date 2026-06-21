import { useEffect } from "react";
import { createPortal } from "react-dom";

import type { SimulationResult } from "@sfcr/core";

import { useFloatingPanelPosition } from "../hooks/useFloatingPanelPosition";
import { MatrixGraphRailPanel } from "../notebook/components/MatrixGraphRailPanel";
import type { MatrixGraphChartEntry } from "../notebook/matrixGraphRailState";
import type { NotebookCell } from "../notebook/types";

const FLOATING_PANEL_STORAGE_KEY = "sfcr:publication-graph-position";

export function PublicationMatrixGraphPopup({
  cells,
  charts,
  getResult,
  onAddChartSeries,
  onClose,
  onDismissChart,
  onRemoveChartSeries,
  onToggleChartLegendMode,
  onToggleChartPin,
  selectedPeriodIndex
}: {
  cells: NotebookCell[];
  charts: MatrixGraphChartEntry[];
  getResult(runCellId: string): SimulationResult | null;
  onAddChartSeries(chartId: string, source: string): void;
  onClose(): void;
  onDismissChart(chartId: string): void;
  onRemoveChartSeries(chartId: string, source: string): void;
  onToggleChartLegendMode(chartId: string): void;
  onToggleChartPin(chartId: string): void;
  selectedPeriodIndex: number;
}) {
  const { position, dragHandleProps } = useFloatingPanelPosition(FLOATING_PANEL_STORAGE_KEY);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const panel = (
    <div
      className="stability-raw-floating-panel publication-graph-popup publication-no-print"
      role="dialog"
      aria-label="Graph"
      style={{ left: position.x, top: position.y }}
    >
      <header
        className="stability-raw-dialog-header stability-raw-dialog-header-draggable"
        {...dragHandleProps}
      >
        <div>
          <div className="eyebrow">Graph</div>
          <p className="stability-raw-dialog-subtitle">Click matrix column headings to graph signed entries.</p>
        </div>
        <button type="button" className="stability-raw-dialog-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </header>

      <div className="stability-raw-dialog-body publication-graph-popup-body">
        <MatrixGraphRailPanel
          cells={cells}
          charts={charts}
          getResult={getResult}
          onAddChartSeries={onAddChartSeries}
          onDismissChart={onDismissChart}
          onRemoveChartSeries={onRemoveChartSeries}
          onToggleChartLegendMode={onToggleChartLegendMode}
          onToggleChartPin={onToggleChartPin}
          selectedPeriodIndex={selectedPeriodIndex}
        />
      </div>
    </div>
  );

  return createPortal(panel, document.body);
}
