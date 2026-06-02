import { generateCld, type CldResult } from "@sfcr/core";
import { equationRowsOnly } from "@sfcr/notebook-core";

import type { EditorState } from "../lib/editorModel";
import { resolveMatrixColumnSumBindings } from "./matrixColumnSumRuntime";
import type { NotebookCell, RunCell } from "./types";

function resolveDefaultRunCellId(cells: NotebookCell[], modelId: string): string | null {
  const runCell = cells.find(
    (cell): cell is RunCell => cell.type === "run" && cell.sourceModelId === modelId
  );
  return runCell?.id ?? null;
}

export function buildCldFromEditor(
  editor: Pick<EditorState, "equations">,
  options?: { notebookCells?: NotebookCell[]; modelId?: string; runCellId?: string }
): CldResult {
  const equationRows = equationRowsOnly(editor.equations).filter(
    (row) => row.name.trim() && row.expression.trim()
  );
  const equations = Object.fromEntries(
    equationRowsOnly(editor.equations)
      .filter((row) => row.name.trim() && row.expression.trim())
      .map((row) => [row.name.trim(), row.expression.trim()])
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
      return generateCld(equations, { matrixColumnSums, nodeKinds });
    }
  }

  return generateCld(equations, { nodeKinds });
}
