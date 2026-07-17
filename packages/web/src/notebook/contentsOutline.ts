import type { NotebookCell } from "./types";

/** Markdown cells are top-level; all other cell types nest under the preceding section. */
export function resolveContentsOutlineLevel(cell: Pick<NotebookCell, "type">): 0 | 1 {
  return cell.type === "markdown" ? 0 : 1;
}
