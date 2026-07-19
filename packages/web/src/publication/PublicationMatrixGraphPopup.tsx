import { useEffect } from "react";
import { createPortal } from "react-dom";

import type { SimulationResult } from "@sfcr/core";

import { useFloatingPanelPosition } from "../hooks/useFloatingPanelPosition";
import { useFloatingPanelSize } from "../hooks/useFloatingPanelSize";
import { MatrixGraphRailPanel } from "../notebook/components/MatrixGraphRailPanel";
import type { MatrixGraphChartEntry } from "../notebook/matrixGraphRailState";
import type { NotebookCell } from "../notebook/types";

const FLOATING_PANEL_STORAGE_KEY = "sfcr:publication-graph-position";
const FLOATING_PANEL_SIZE_KEY = "sfcr:publication-graph-size";
const DEFAULT_GRAPH_PANEL_SIZE = { width: 544, height: 480 };

export function PublicationMatrixGraphPopup({
  cells,
  charts,
  getResult,
  onAddChartSeries,
  onClose,
  onCreateChartFromVariable,
  onCreateEmptyChart,
  onDismissChart,
  onMoveChartSeries,
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
  onCreateChartFromVariable?(source: string): void;
  onCreateEmptyChart?(): void;
  onDismissChart(chartId: string): void;
  onMoveChartSeries?(chartId: string, source: string, direction: "left" | "right"): void;
  onRemoveChartSeries(chartId: string, source: string): void;
  onToggleChartLegendMode(chartId: string): void;
  onToggleChartPin(chartId: string): void;
  selectedPeriodIndex: number;
}) {
  const { position, dragHandleProps } = useFloatingPanelPosition(FLOATING_PANEL_STORAGE_KEY);
  const { size, resizeHandleProps } = useFloatingPanelSize({
    defaultSize: DEFAULT_GRAPH_PANEL_SIZE,
    position,
    storageKey: FLOATING_PANEL_SIZE_KEY
  });

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
      style={{
        height: size.height,
        left: position.x,
        top: position.y,
        width: size.width
      }}
    >
      <header
        className="stability-raw-dialog-header stability-raw-dialog-header-draggable"
        {...dragHandleProps}
      >
        <div>
          <div className="eyebrow">Graph</div>
          <p className="stability-raw-dialog-subtitle">
            Click a matrix row or column label to graph signed entries. Or pick a variable below.
          </p>
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
          onCreateChartFromVariable={onCreateChartFromVariable}
          onCreateEmptyChart={onCreateEmptyChart}
          onDismissChart={onDismissChart}
          onMoveChartSeries={onMoveChartSeries}
          onRemoveChartSeries={onRemoveChartSeries}
          onToggleChartLegendMode={onToggleChartLegendMode}
          onToggleChartPin={onToggleChartPin}
          selectedPeriodIndex={selectedPeriodIndex}
        />
      </div>
      <div {...resizeHandleProps} aria-label="Resize graph panel" />
    </div>
  );

  return createPortal(panel, document.body);
}
