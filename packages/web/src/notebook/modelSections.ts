import type { EditorOptions, EditorState, EquationRow, ExternalRow, InitialValueRow } from "../lib/editorModel";
import type {
  EquationsCell,
  ExternalsCell,
  InitialValuesCell,
  ModelCell,
  NotebookCell,
  NotebookDocument,
  RunCell,
  SolverCell
} from "./types";

export function findLegacyModelCell(cells: NotebookCell[], cellId: string): ModelCell | null {
  return cells.find((cell): cell is ModelCell => cell.type === "model" && cell.id === cellId) ?? null;
}

export function findEquationsCell(cells: NotebookCell[], modelId: string): EquationsCell | null {
  return (
    cells.find(
      (cell): cell is EquationsCell => cell.type === "equations" && cell.modelId === modelId
    ) ?? null
  );
}

export function findExternalsCell(cells: NotebookCell[], modelId: string): ExternalsCell | null {
  return (
    cells.find(
      (cell): cell is ExternalsCell => cell.type === "externals" && cell.modelId === modelId
    ) ?? null
  );
}

export function findInitialValuesCell(
  cells: NotebookCell[],
  modelId: string
): InitialValuesCell | null {
  return (
    cells.find(
      (cell): cell is InitialValuesCell =>
        cell.type === "initial-values" && cell.modelId === modelId
    ) ?? null
  );
}

export function findSolverCell(cells: NotebookCell[], modelId: string): SolverCell | null {
  return (
    cells.find((cell): cell is SolverCell => cell.type === "solver" && cell.modelId === modelId) ??
    null
  );
}

export function resolveNotebookModelKey(
  cells: NotebookCell[],
  source: { modelId?: string; sourceModelId?: string; sourceModelCellId?: string }
): string | null {
  const modelId = source.modelId ?? source.sourceModelId;
  if (typeof modelId === "string" && modelId.trim() !== "") {
    return `model:${modelId.trim()}`;
  }

  const legacyCellId = source.sourceModelCellId?.trim();
  if (!legacyCellId) {
    return null;
  }

  const cell = cells.find((entry) => entry.id === legacyCellId);
  if (!cell) {
    return null;
  }

  if (cell.type === "model") {
    return `cell:${cell.id}`;
  }

  if (
    (cell.type === "equations" ||
      cell.type === "solver" ||
      cell.type === "externals" ||
      cell.type === "initial-values") &&
    cell.modelId
  ) {
    return `model:${cell.modelId}`;
  }

  return null;
}

export function resolveRunCellModelKey(cells: NotebookCell[], cell: RunCell): string | null {
  return resolveNotebookModelKey(cells, cell);
}

export function buildEditorStateForNotebookModel(
  document: NotebookDocument,
  source: { modelId?: string; sourceModelId?: string; sourceModelCellId?: string }
): EditorState | null {
  const modelId = source.modelId ?? source.sourceModelId;
  if (typeof modelId === "string" && modelId.trim() !== "") {
    const equationsCell = findEquationsCell(document.cells, modelId);
    const solverCell = findSolverCell(document.cells, modelId);
    if (!equationsCell || !solverCell) {
      return null;
    }

    return {
      equations: equationsCell.equations,
      externals: findExternalsCell(document.cells, modelId)?.externals ?? [],
      initialValues: findInitialValuesCell(document.cells, modelId)?.initialValues ?? [],
      options: solverCell.options,
      scenario: { shocks: [] }
    };
  }

  const legacyCellId = source.sourceModelCellId?.trim();
  if (!legacyCellId) {
    return null;
  }

  const legacyCell = findLegacyModelCell(document.cells, legacyCellId);
  return legacyCell?.editor ?? null;
}

export function countModelSectionIssues(
  issuePaths: string[],
  prefix: "equations." | "externals." | "initialValues." | "options."
): number {
  return issuePaths.filter((path) => path.startsWith(prefix)).length;
}

export function buildEditorStateFromSections(args: {
  equations: EquationRow[];
  externals: ExternalRow[];
  initialValues: InitialValueRow[];
  options: EditorOptions;
}): EditorState {
  return {
    equations: args.equations,
    externals: args.externals,
    initialValues: args.initialValues,
    options: args.options,
    scenario: { shocks: [] }
  };
}
