import type { EditorState } from "./editorModel";
import type { NotebookCell, NotebookDocument } from "../notebook/types";
import { findEquationsCell, findExternalsCell, findInitialValuesCell, findLegacyModelCell, findSolverCell } from "../notebook/modelSections";

export type InspectorModelSource = { sourceModelId: string } | { sourceModelCellId: string };

export interface VariableInspectContext {
  currentValues: Record<string, number | undefined>;
  editor: EditorState;
  modelSource: InspectorModelSource | null;
  variableDescriptions: import("./variableDescriptions").VariableDescriptions;
  variableUnitMetadata: import("./unitMeta").VariableUnitMetadata;
}

export interface VariableInspectRequest extends VariableInspectContext {
  selectedVariable: string;
}

export function resolveInspectorModelSource(
  source: { modelId?: string; sourceModelId?: string; sourceModelCellId?: string } | null | undefined
): InspectorModelSource | null {
  const modelId = source?.modelId?.trim() || source?.sourceModelId?.trim();
  if (modelId) {
    return { sourceModelId: modelId };
  }

  const legacyCellId = source?.sourceModelCellId?.trim();
  if (legacyCellId) {
    return { sourceModelCellId: legacyCellId };
  }

  return null;
}

export function resolveInspectorModelSourceFromCell(cell: NotebookCell): InspectorModelSource | null {
  if (cell.type === "model") {
    return { sourceModelCellId: cell.id };
  }

  if (
    cell.type === "equations" ||
    cell.type === "externals" ||
    cell.type === "initial-values" ||
    cell.type === "solver"
  ) {
    return { sourceModelId: cell.modelId };
  }

  if (cell.type === "run") {
    return resolveInspectorModelSource(cell);
  }

  if (cell.type === "sequence" && cell.source.kind === "dependency") {
    return resolveInspectorModelSource(cell.source);
  }

  return null;
}

export function isInspectorModelEditable(
  cells: NotebookCell[],
  modelSource: InspectorModelSource | null
): boolean {
  if (!modelSource) {
    return false;
  }

  if ("sourceModelCellId" in modelSource) {
    return findLegacyModelCell(cells, modelSource.sourceModelCellId) != null;
  }

  return findEquationsCell(cells, modelSource.sourceModelId) != null;
}

export function updateEditorDefiningEquationExpression(
  editor: EditorState,
  equationId: string,
  expression: string
): EditorState {
  return {
    ...editor,
    equations: editor.equations.map((equation) =>
      equation.id === equationId ? { ...equation, expression } : equation
    )
  };
}

export function applyInspectorDefiningEquationExpression(
  document: NotebookDocument,
  modelSource: InspectorModelSource,
  equationId: string,
  expression: string
): NotebookDocument {
  if ("sourceModelCellId" in modelSource) {
    return {
      ...document,
      cells: document.cells.map((cell) => {
        if (cell.type !== "model" || cell.id !== modelSource.sourceModelCellId) {
          return cell;
        }

        return {
          ...cell,
          editor: updateEditorDefiningEquationExpression(cell.editor, equationId, expression)
        };
      })
    };
  }

  return {
    ...document,
    cells: document.cells.map((cell) => {
      if (cell.type !== "equations" || cell.modelId !== modelSource.sourceModelId) {
        return cell;
      }

      return {
        ...cell,
        equations: cell.equations.map((equation) =>
          equation.id === equationId ? { ...equation, expression } : equation
        )
      };
    })
  };
}

export function buildEditorStateForInspectorModelSource(
  document: NotebookDocument,
  modelSource: InspectorModelSource
): EditorState | null {
  if ("sourceModelCellId" in modelSource) {
    return findLegacyModelCell(document.cells, modelSource.sourceModelCellId)?.editor ?? null;
  }

  const equationsCell = findEquationsCell(document.cells, modelSource.sourceModelId);
  const solverCell = findSolverCell(document.cells, modelSource.sourceModelId);
  if (!equationsCell || !solverCell) {
    return null;
  }

  return {
    equations: equationsCell.equations,
    externals: findExternalsCell(document.cells, modelSource.sourceModelId)?.externals ?? [],
    initialValues: findInitialValuesCell(document.cells, modelSource.sourceModelId)?.initialValues ?? [],
    options: solverCell.options,
    scenario: { shocks: [] }
  };
}
