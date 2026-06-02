import { generateCld, type CldResult } from "@sfcr/core";
import { equationRowsOnly } from "@sfcr/notebook-core";

import type { EditorState } from "../lib/editorModel";

export function buildCldFromEditor(editor: Pick<EditorState, "equations">): CldResult {
  const equations = Object.fromEntries(
    equationRowsOnly(editor.equations)
      .filter((row) => row.name.trim() && row.expression.trim())
      .map((row) => [row.name.trim(), row.expression.trim()])
  );
  return generateCld(equations);
}
