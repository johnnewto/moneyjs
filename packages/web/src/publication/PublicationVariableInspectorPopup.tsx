import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { VariableInspector } from "../components/VariableInspector";
import { useFloatingPanelPosition } from "../hooks/useFloatingPanelPosition";
import {
  buildVariableInspectorData,
  collectInspectorVariableNames
} from "../lib/variableInspector";
import {
  buildInspectorSeriesValues,
  type VariableInspectRequest
} from "../lib/variableInspect";
import { VariableUsagesPopup } from "../notebook/components/VariableUsagesPopup";
import { countVariableReferences, type ModelRenameScope } from "../notebook/renameVariable";
import type { NotebookDocument } from "../notebook/types";

const FLOATING_PANEL_STORAGE_KEY = "sfcr:publication-inspector-position";

export function PublicationVariableInspectorPopup({
  notebookDocument,
  getResult,
  inspectorContext,
  onClose,
  onGoBack,
  onGoForward,
  onNavigateToVariable,
  onSelectVariable,
  selectedPeriodIndex,
  canGoBack = false,
  canGoForward = false
}: {
  notebookDocument: NotebookDocument;
  getResult: (runCellId: string) => import("@sfcr/core").SimulationResult | null;
  inspectorContext: VariableInspectRequest;
  onClose(): void;
  onGoBack?(): void;
  onGoForward?(): void;
  onNavigateToVariable?(cellId: string, variableName: string): void;
  onSelectVariable(variableName: string): void;
  selectedPeriodIndex: number;
  canGoBack?: boolean;
  canGoForward?: boolean;
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

  const variableOptions = useMemo(
    () => collectInspectorVariableNames(inspectorContext.editor),
    [inspectorContext.editor]
  );

  const renameScope = useMemo<ModelRenameScope | null>(() => {
    const source = inspectorContext.modelSource;
    if (!source) {
      return null;
    }
    if ("sourceModelCellId" in source && source.sourceModelCellId) {
      return { kind: "legacyModelCell", cellId: source.sourceModelCellId };
    }
    if ("sourceModelId" in source && source.sourceModelId) {
      return { kind: "modelId", modelId: source.sourceModelId };
    }
    return null;
  }, [inspectorContext.modelSource]);

  const usages = useMemo(() => {
    const variableName = inspectorContext.selectedVariable.trim();
    if (!variableName || !renameScope) {
      return [];
    }
    return countVariableReferences(notebookDocument.cells, renameScope, variableName).affectedCells;
  }, [inspectorContext.selectedVariable, renameScope, notebookDocument.cells]);

  const [usagesOpen, setUsagesOpen] = useState(false);
  useEffect(() => {
    setUsagesOpen(Boolean(renameScope));
  }, [inspectorContext.selectedVariable, renameScope]);

  const inspectorData = buildVariableInspectorData({
    currentValues: inspectorContext.currentValues,
    editor: inspectorContext.editor,
    notebookCells: notebookDocument.cells,
    modelSource: inspectorContext.modelSource,
    sourceRunCellId: inspectorContext.sourceRunCellId,
    getResult,
    selectedVariable: inspectorContext.selectedVariable,
    variableDescriptions: inspectorContext.variableDescriptions,
    variableUnitMetadata: inspectorContext.variableUnitMetadata
  });

  const seriesValues = buildInspectorSeriesValues({
    document: notebookDocument,
    getResult,
    modelSource: inspectorContext.modelSource,
    sourceRunCellId: inspectorContext.sourceRunCellId,
    variableName: inspectorContext.selectedVariable
  });

  const panel = (
    <div
      className="stability-raw-floating-panel publication-inspector-popup publication-no-print"
      role="dialog"
      aria-label="Variable inspector"
      style={{ left: position.x, top: position.y }}
    >
      <header
        className="stability-raw-dialog-header stability-raw-dialog-header-draggable"
        {...dragHandleProps}
      >
        <div>
          <div className="eyebrow">Variable inspector</div>
          <p className="stability-raw-dialog-subtitle">
            Period {selectedPeriodIndex + 1}
            {inspectorData?.description?.trim() ? ` · ${inspectorData.description.trim()}` : ""}
          </p>
        </div>
        <button type="button" className="stability-raw-dialog-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </header>

      <div className="stability-raw-dialog-body publication-inspector-popup-body">
        <VariableInspector
          canEditDefiningEquation={false}
          canGoBack={canGoBack}
          canGoForward={canGoForward}
          commitStyle="draft"
          currentValues={inspectorContext.currentValues}
          data={inspectorData}
          onGoBack={onGoBack}
          onGoForward={onGoForward}
          onSelectVariable={onSelectVariable}
          onShowUsages={renameScope ? () => setUsagesOpen(true) : undefined}
          usagesCount={usages.length}
          variableOptions={variableOptions}
          selectedPeriodIndex={selectedPeriodIndex}
          seriesValues={seriesValues}
          variableDescriptions={inspectorContext.variableDescriptions}
          variableUnitMetadata={inspectorContext.variableUnitMetadata}
        />
      </div>
    </div>
  );

  return (
    <>
      {createPortal(panel, document.body)}
      {usagesOpen && inspectorContext.selectedVariable ? (
        <VariableUsagesPopup
          variableName={inspectorContext.selectedVariable}
          usages={usages}
          onClose={() => setUsagesOpen(false)}
          onNavigate={(cellId) =>
            onNavigateToVariable?.(cellId, inspectorContext.selectedVariable)
          }
        />
      ) : null}
    </>
  );
}
