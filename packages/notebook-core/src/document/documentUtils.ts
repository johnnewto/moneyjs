import type { NotebookCell } from "../types";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

export function stringArray(value: unknown): string[] | null {
  return Array.isArray(value) ? value.map((entry) => String(entry)) : null;
}

export function stringValue(value: unknown, fallback: string): string {
  return value == null ? fallback : String(value);
}

export function numberValue(value: unknown, fallback: number): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function slugifyIdentifier(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "value";
}

export function scalarFromValueText(valueText: string): string | number | boolean {
  if (valueText === "true") {
    return true;
  }
  if (valueText === "false") {
    return false;
  }
  const number = Number(valueText);
  return Number.isFinite(number) && String(number) === valueText.trim() ? number : valueText;
}

export function validateCell(cell: NotebookCell | Partial<NotebookCell>): void {
  if (!cell || typeof cell !== "object") {
    throw new Error("Notebook cell must be an object.");
  }
  if (typeof cell.id !== "string" || typeof cell.title !== "string" || typeof cell.type !== "string") {
    throw new Error("Notebook cell must contain id, title, and type.");
  }
}

export function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "notebook";
}

export function offsetToLineColumn(source: string, offset: number): { column: number; line: number } {
  let line = 1;
  let column = 1;

  for (let index = 0; index < offset && index < source.length; index += 1) {
    if (source[index] === "\n") {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }

  return { column, line };
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

