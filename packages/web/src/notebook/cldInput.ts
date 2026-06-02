import type { CldNodeKind } from "@sfcr/core";
import type { MatrixColumnSumBindings } from "@sfcr/core";
import { equationRowsOnly } from "@sfcr/notebook-core";

import type { EditorState } from "../lib/editorModel";
import { buildEditorStateForNotebookModel } from "./modelSections";
import { resolveMatrixColumnSumBindings } from "./matrixColumnSumRuntime";
import type { NotebookCell, RunCell } from "./types";

export interface CldWorkerPayload {
  equations: Record<string, string>;
  matrixColumnSums?: MatrixColumnSumBindings;
  nodeKinds?: Record<string, CldNodeKind | undefined>;
}

function resolveDefaultRunCellId(cells: NotebookCell[], modelId: string): string | null {
  const runCell = cells.find(
    (cell): cell is RunCell => cell.type === "run" && cell.sourceModelId === modelId
  );
  return runCell?.id ?? null;
}

export function buildCldWorkerPayloadFromEditor(
  editor: Pick<EditorState, "equations">,
  options?: { notebookCells?: NotebookCell[]; modelId?: string; runCellId?: string }
): CldWorkerPayload {
  const equationRows = equationRowsOnly(editor.equations).filter(
    (row) => row.name.trim() && row.expression.trim()
  );
  const equations = Object.fromEntries(
    equationRows.map((row) => [row.name.trim(), row.expression.trim()])
  );
  const nodeKinds = Object.fromEntries(
    equationRows
      .map((row) => [row.name.trim(), row.unitMeta?.stockFlow] as const)
      .filter((entry) => entry[0] && entry[1])
  );

  const notebookCells = options?.notebookCells;
  const modelId = options?.modelId?.trim();
  const runCellId = options?.runCellId?.trim();

  if (notebookCells && modelId) {
    const effectiveRunCellId = runCellId || resolveDefaultRunCellId(notebookCells, modelId);
    if (effectiveRunCellId) {
      const matrixColumnSums = resolveMatrixColumnSumBindings({
        cells: notebookCells,
        modelId,
        runCellId: effectiveRunCellId,
        equationSources: Object.values(equations)
      });
      return { equations, matrixColumnSums, nodeKinds };
    }
  }

  return { equations, nodeKinds };
}

export function buildCldWorkerPayload(
  cells: NotebookCell[],
  source: { modelId?: string; sourceModelId?: string; sourceModelCellId?: string }
): CldWorkerPayload | null {
  const editor = buildEditorStateForNotebookModel(
    {
      id: "cld-worker-input",
      title: "CLD source",
      metadata: { version: 1 },
      cells
    },
    source
  );
  if (!editor) {
    return null;
  }

  const modelId = source.modelId ?? source.sourceModelId;
  return buildCldWorkerPayloadFromEditor(editor, {
    notebookCells: cells,
    modelId: typeof modelId === "string" ? modelId : undefined
  });
}

function stableSerializeMatrixColumnSums(bindings?: MatrixColumnSumBindings): string {
  if (!bindings) {
    return "";
  }
  return Object.keys(bindings)
    .sort((left, right) => left.localeCompare(right))
    .map((key) => `${key}:${bindings[key]?.join("|") ?? ""}`)
    .join("\n");
}

export function fingerprintCldWorkerPayload(payload: CldWorkerPayload): string {
  const equationLines = Object.keys(payload.equations)
    .sort((left, right) => left.localeCompare(right))
    .map((name) => `${name}\0${payload.equations[name]}`);
  const nodeKindLines = Object.keys(payload.nodeKinds ?? {})
    .sort((left, right) => left.localeCompare(right))
    .map((name) => `${name}\0${payload.nodeKinds?.[name] ?? ""}`);
  return [equationLines.join("\n"), stableSerializeMatrixColumnSums(payload.matrixColumnSums), nodeKindLines.join("\n")].join(
    "\n---\n"
  );
}

export function buildCldInputKey(
  cells: NotebookCell[],
  source: { modelId?: string; sourceModelId?: string; sourceModelCellId?: string }
): string {
  const payload = buildCldWorkerPayload(cells, source);
  if (!payload) {
    return "";
  }
  return fingerprintCldWorkerPayload(payload);
}
