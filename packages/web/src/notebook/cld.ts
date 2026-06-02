import { generateCld, type CldResult } from "@sfcr/core";

import type { EditorState } from "../lib/editorModel";
import { buildCldWorkerPayloadFromEditor } from "./cldInput";
import type { NotebookCell } from "./types";

export function buildCldFromEditor(
  editor: Pick<EditorState, "equations">,
  options?: { notebookCells?: NotebookCell[]; modelId?: string; runCellId?: string }
): CldResult {
  const payload = buildCldWorkerPayloadFromEditor(editor, options);
  return generateCld(payload.equations, {
    matrixColumnSums: payload.matrixColumnSums,
    nodeKinds: payload.nodeKinds
  });
}
