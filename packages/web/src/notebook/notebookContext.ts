import type { NotebookCell } from "./types";

export function resolveNearestNotebookContextCell(
  cells: NotebookCell[],
  cell: NotebookCell
): NotebookCell | null {
  const currentIndex = cells.findIndex((candidate) => candidate.id === cell.id);
  if (currentIndex < 0) {
    return null;
  }

  for (let offset = 1; offset < cells.length; offset += 1) {
    const forwardCandidate = cells[currentIndex + offset];
    if (forwardCandidate && forwardCandidate.type !== "markdown") {
      return forwardCandidate;
    }

    const backwardCandidate = cells[currentIndex - offset];
    if (backwardCandidate && backwardCandidate.type !== "markdown") {
      return backwardCandidate;
    }
  }

  return null;
}
