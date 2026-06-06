import { isRowComment } from "@sfcr/notebook-core";

export interface RowNameChange {
  id: string;
  newName: string;
  oldName: string;
}

export function findFirstRowNameChange(
  previousRows: ReadonlyArray<{ id: string; name?: string; type?: string }>,
  nextRows: ReadonlyArray<{ id: string; name?: string; type?: string }>
): RowNameChange | null {
  const previousById = new Map(
    previousRows
      .filter((row) => !isRowComment(row))
      .map((row) => [row.id, (row.name ?? "").trim()] as const)
  );

  for (const row of nextRows) {
    if (isRowComment(row)) {
      continue;
    }

    const oldName = previousById.get(row.id);
    const newName = (row.name ?? "").trim();
    if (oldName && newName && oldName !== newName) {
      return { id: row.id, oldName, newName };
    }
  }

  return null;
}
