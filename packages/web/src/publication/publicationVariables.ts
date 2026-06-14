import { buildVariableDescriptions, type VariableDescriptions } from "../lib/variableDescriptions";
import type { NotebookCell } from "../notebook/types";

export function buildPublicationVariableDescriptions(cells: NotebookCell[]): VariableDescriptions {
  const descriptions = buildVariableDescriptions({});

  for (const cell of cells) {
    const nextDescriptions =
      cell.type === "model"
        ? buildVariableDescriptions({
            equations: cell.editor.equations,
            externals: cell.editor.externals
          })
        : cell.type === "equations"
          ? buildVariableDescriptions({ equations: cell.equations })
          : cell.type === "externals"
            ? buildVariableDescriptions({ externals: cell.externals })
            : null;

    for (const [name, description] of nextDescriptions ?? []) {
      if (!descriptions.has(name)) {
        descriptions.set(name, description);
      }
    }
  }

  return descriptions;
}
