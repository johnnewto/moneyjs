import { notebookFromJson, notebookToJson } from "./document";
import type { NotebookDocument } from "./types";
import { validateNotebookDocument, type NotebookValidationIssue } from "./validation";

export type NotebookPatchOperation =
  | {
      op: "add" | "replace";
      path: string;
      value: unknown;
    }
  | {
      op: "remove";
      path: string;
    };

export interface NotebookPatch {
  description?: string;
  operations: NotebookPatchOperation[];
}

export interface NotebookPatchIssue {
  message: string;
  path?: string;
  severity: "error" | "warning";
}

export interface NotebookPatchSummary {
  addedCells: number;
  changedCells: number;
  operationCount: number;
  removedCells: number;
}

export type NotebookPatchResult =
  | {
      document: NotebookDocument;
      issues: NotebookPatchIssue[];
      ok: true;
      summary: NotebookPatchSummary;
    }
  | {
      issues: NotebookPatchIssue[];
      ok: false;
      summary: NotebookPatchSummary;
    };

const ALLOWED_CELL_PROPERTIES = new Set([
  "axisMode",
  "baselineRunCellId",
  "baselineStartPeriod",
  "collapsed",
  "columns",
  "description",
  "equations",
  "externals",
  "initialValues",
  "niceScale",
  "note",
  "options",
  "periods",
  "rows",
  "scenario",
  "sectors",
  "seriesRanges",
  "sharedRange",
  "source",
  "sourceModelCellId",
  "sourceModelId",
  "sourceRunCellId",
  "timeRangeInclusive",
  "title",
  "variables",
  "yAxisTickCount"
]);

export function validateNotebookPatch(
  document: NotebookDocument,
  patch: NotebookPatch
): NotebookPatchResult {
  return previewNotebookPatch(document, patch);
}

export function previewNotebookPatch(
  document: NotebookDocument,
  patch: NotebookPatch
): NotebookPatchResult {
  const patchIssues = validatePatchShape(patch);
  if (patchIssues.length > 0) {
    return {
      issues: patchIssues,
      ok: false,
      summary: summarizePatch(document, document, patch)
    };
  }

  let nextDocument: NotebookDocument;
  try {
    nextDocument = applyPatchOperations(document, patch.operations);
  } catch (error) {
    return {
      issues: [
        {
          message: error instanceof Error ? error.message : "Unable to apply notebook patch.",
          severity: "error"
        }
      ],
      ok: false,
      summary: summarizePatch(document, document, patch)
    };
  }

  let normalized: NotebookDocument;
  try {
    normalized = normalizePatchedDocument(nextDocument);
  } catch (error) {
    return {
      issues: [
        {
          message: error instanceof Error ? error.message : "Patched notebook failed schema validation.",
          severity: "error"
        }
      ],
      ok: false,
      summary: summarizePatch(document, nextDocument, patch)
    };
  }

  const validationIssues = validatePatchedDocument(normalized);
  const summary = summarizePatch(document, normalized, patch);

  if (validationIssues.length > 0) {
    return {
      issues: validationIssues,
      ok: false,
      summary
    };
  }

  return {
    document: normalized,
    issues: [],
    ok: true,
    summary
  };
}

export function applyNotebookPatch(
  document: NotebookDocument,
  patch: NotebookPatch
): NotebookPatchResult {
  return previewNotebookPatch(document, patch);
}

function validatePatchShape(patch: unknown): NotebookPatchIssue[] {
  const issues: NotebookPatchIssue[] = [];

  if (!patch || typeof patch !== "object") {
    return [{ message: "Notebook patch must be an object.", severity: "error" }];
  }

  const operations = (patch as { operations?: unknown }).operations;
  if (!Array.isArray(operations)) {
    return [{ message: "Notebook patch operations must be an array.", severity: "error" }];
  }

  operations.forEach((operation, index) => {
    if (!operation || typeof operation !== "object") {
      issues.push({ message: `Patch operation ${index + 1} must be an object.`, severity: "error" });
      return;
    }

    const record = operation as Record<string, unknown>;
    const op = record.op;
    const path = record.path;

    if (op !== "add" && op !== "replace" && op !== "remove") {
      issues.push({ message: `Patch operation ${index + 1} has unsupported op.`, severity: "error" });
    }

    if (typeof path !== "string" || path.trim() === "") {
      issues.push({ message: `Patch operation ${index + 1} must include a path.`, severity: "error" });
      return;
    }

    if (!isAllowedPatchPath(path)) {
      issues.push({
        message: `Patch operation ${index + 1} targets unsupported notebook path '${path}'.`,
        path,
        severity: "error"
      });
    }

    if ((op === "add" || op === "replace") && !("value" in record)) {
      issues.push({
        message: `Patch operation ${index + 1} must include a value.`,
        path,
        severity: "error"
      });
    }
  });

  return issues;
}

function applyPatchOperations(
  document: NotebookDocument,
  operations: NotebookPatchOperation[]
): NotebookDocument {
  const draft = structuredClone(document) as unknown;

  for (const operation of operations) {
    applyOperation(draft, operation);
  }

  return draft as NotebookDocument;
}

function applyOperation(target: unknown, operation: NotebookPatchOperation): void {
  const pointer = parseJsonPointer(operation.path);
  if (pointer.length === 0) {
    throw new Error("Patch path must not target the notebook root.");
  }

  const parent = resolveParent(target, pointer, operation.path);
  const key = pointer[pointer.length - 1];

  if (Array.isArray(parent)) {
    applyArrayOperation(parent, key, operation);
    return;
  }

  if (!parent || typeof parent !== "object") {
    throw new Error(`Patch path '${operation.path}' does not resolve to an object.`);
  }

  const record = parent as Record<string, unknown>;
  if (operation.op === "add" || operation.op === "replace") {
    if (operation.op === "replace" && !(key in record)) {
      throw new Error(`Patch path '${operation.path}' does not exist for replace.`);
    }
    record[key] = structuredClone(operation.value);
    return;
  }

  if (!(key in record)) {
    throw new Error(`Patch path '${operation.path}' does not exist for remove.`);
  }
  delete record[key];
}

function applyArrayOperation(
  target: unknown[],
  key: string,
  operation: NotebookPatchOperation
): void {
  const index = resolveArrayIndex(target, key, operation);

  if (operation.op === "add") {
    target.splice(index, 0, structuredClone(operation.value));
    return;
  }

  if (index < 0 || index >= target.length) {
    throw new Error(`Patch path '${operation.path}' is outside the array range.`);
  }

  if (operation.op === "replace") {
    target[index] = structuredClone(operation.value);
    return;
  }

  target.splice(index, 1);
}

function resolveArrayIndex(
  target: unknown[],
  key: string,
  operation: NotebookPatchOperation
): number {
  if (key === "-") {
    if (operation.op !== "add") {
      throw new Error(`Patch path '${operation.path}' can use '-' only for add operations.`);
    }
    return target.length;
  }

  if (!/^\d+$/.test(key)) {
    throw new Error(`Patch path '${operation.path}' must use a numeric array index.`);
  }

  const index = Number(key);
  if (operation.op === "add" && index <= target.length) {
    return index;
  }
  if (index >= 0 && index < target.length) {
    return index;
  }

  throw new Error(`Patch path '${operation.path}' is outside the array range.`);
}

function resolveParent(target: unknown, pointer: string[], originalPath: string): unknown {
  const parentPointer = pointer.slice(0, -1);
  let current = target;
  let index = 0;

  while (index < parentPointer.length) {
    const segment = parentPointer[index];
    if (current == null || typeof current !== "object") {
      throw new Error(`Patch path '${originalPath}' does not exist.`);
    }

    if (Array.isArray(current)) {
      if (segment === "by-id") {
        const cellId = parentPointer[index + 1];
        if (!cellId) {
          throw new Error(`Patch path '${originalPath}' must include a cell id after by-id.`);
        }
        const cell = current.find(
          (entry): entry is { id: string } => Boolean(entry) && typeof entry === "object" && (entry as { id?: unknown }).id === cellId
        );
        if (!cell) {
          throw new Error(`Patch path '${originalPath}' references unknown cell id '${cellId}'.`);
        }
        current = cell;
        index += 2;
        continue;
      }

      if (!/^\d+$/.test(segment)) {
        throw new Error(`Patch path '${originalPath}' must use a numeric array index.`);
      }
      const arrayIndex = Number(segment);
      if (arrayIndex < 0 || arrayIndex >= current.length) {
        throw new Error(`Patch path '${originalPath}' is outside the array range.`);
      }
      current = current[arrayIndex];
      index += 1;
      continue;
    }

    const record = current as Record<string, unknown>;
    if (!(segment in record)) {
      throw new Error(`Patch path '${originalPath}' does not exist.`);
    }
    current = record[segment];
    index += 1;
  }

  return current;
}

function parseJsonPointer(path: string): string[] {
  if (!path.startsWith("/")) {
    throw new Error(`Patch path '${path}' must be a JSON Pointer.`);
  }

  return path
    .split("/")
    .slice(1)
    .map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"));
}

function isAllowedPatchPath(path: string): boolean {
  let pointer: string[];
  try {
    pointer = parseJsonPointer(path);
  } catch {
    return false;
  }

  if (pointer.length === 1) {
    return pointer[0] === "title";
  }

  if (pointer[0] !== "cells" || pointer.length < 2) {
    return false;
  }

  if (pointer[1] === "by-id") {
    return pointer.length >= 4 && pointer[2] !== "" && ALLOWED_CELL_PROPERTIES.has(pointer[3]);
  }

  if (pointer[1] === "-") {
    return pointer.length === 2;
  }

  if (!/^\d+$/.test(pointer[1])) {
    return false;
  }

  if (pointer.length === 2) {
    return true;
  }

  return pointer.length >= 4 && ALLOWED_CELL_PROPERTIES.has(pointer[2]);
}

function normalizePatchedDocument(document: NotebookDocument): NotebookDocument {
  return notebookFromJson(notebookToJson(document));
}

function validatePatchedDocument(document: NotebookDocument): NotebookPatchIssue[] {
  return validateNotebookDocument(document).map(validationIssueToPatchIssue);
}

function validationIssueToPatchIssue(issue: NotebookValidationIssue): NotebookPatchIssue {
  return {
    message: issue.message,
    path: issue.path,
    severity: issue.severity
  };
}

function summarizePatch(
  before: NotebookDocument,
  after: NotebookDocument,
  patch: NotebookPatch
): NotebookPatchSummary {
  const beforeCellIds = new Set(before.cells.map((cell) => cell.id));
  const afterCellIds = new Set(after.cells.map((cell) => cell.id));
  const addedCells = after.cells.filter((cell) => !beforeCellIds.has(cell.id)).length;
  const removedCells = before.cells.filter((cell) => !afterCellIds.has(cell.id)).length;
  const changedCells = after.cells.filter((cell) => {
    if (!beforeCellIds.has(cell.id)) {
      return false;
    }
    const beforeCell = before.cells.find((candidate) => candidate.id === cell.id);
    return JSON.stringify(beforeCell) !== JSON.stringify(cell);
  }).length;

  return {
    addedCells,
    changedCells,
    operationCount: patch.operations.length,
    removedCells
  };
}
