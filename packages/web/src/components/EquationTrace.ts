import type { MouseEvent } from "react";

import { isRowComment, type EquationListItem } from "@sfcr/notebook-core";

import type { EquationRow } from "../lib/editorModel";

export type TraceMode = "inputs" | "outputs" | "both";
type TraceRowRole = "root" | "input" | "output" | "both";
export type TraceTokenRole = "root" | "input" | "output" | "both";

interface TraceRowMeta {
  id: string;
  output: string | null;
  inputs: string[];
}

export interface TraceModel {
  rows: TraceRowMeta[];
  rowById: Map<string, TraceRowMeta>;
  rowsByOutput: Map<string, string[]>;
}

export interface ActiveTrace {
  tokenStates: Map<string, TraceTokenRole>;
  rowStates: Map<string, TraceRowRole>;
}

export interface PinnedTrace {
  mode: TraceMode;
  rowId: string;
}

export function buildTraceModel(rows: readonly EquationListItem[]): TraceModel {
  const traceRows = rows.flatMap((row) => {
    if (isRowComment(row)) {
      return [];
    }
    return [
      {
        id: row.id,
        output: normalizeVariableName(row.name),
        inputs: extractVariableTokens(row.expression)
      }
    ];
  });

  const rowsByOutput = new Map<string, string[]>();
  for (const row of traceRows) {
    if (!row.output) {
      continue;
    }
    rowsByOutput.set(row.output, [...(rowsByOutput.get(row.output) ?? []), row.id]);
  }

  return {
    rows: traceRows,
    rowById: new Map(traceRows.map((row) => [row.id, row])),
    rowsByOutput
  };
}

export function buildActiveTrace(
  model: TraceModel,
  rowId: string,
  mode: TraceMode
): ActiveTrace | null {
  const root = model.rowById.get(rowId);
  if (!root) {
    return null;
  }

  const rowStates = new Map<string, TraceRowRole>([[rowId, "root"]]);
  const tokenStates = new Map<string, TraceTokenRole>();

  addTraceToken(tokenStates, root.output, "root");
  for (const input of root.inputs) {
    addTraceToken(tokenStates, input, "input");
  }

  if (mode === "inputs" || mode === "both") {
    for (const input of root.inputs) {
      for (const inputRowId of model.rowsByOutput.get(input) ?? []) {
        mergeRowTrace(rowStates, inputRowId, "input");
      }
      addTraceToken(tokenStates, input, "input");
    }
  }

  if (root.output && (mode === "outputs" || mode === "both")) {
    for (const row of model.rows) {
      if (row.id === rowId || !row.inputs.includes(root.output)) {
        continue;
      }
      mergeRowTrace(rowStates, row.id, "output");
    }
    addTraceToken(tokenStates, root.output, "output");
  }

  for (const [relatedRowId, role] of rowStates.entries()) {
    const relatedRow = model.rowById.get(relatedRowId);
    if (!relatedRow) {
      continue;
    }
    if (role === "input" || role === "both") {
      addTraceToken(tokenStates, relatedRow.output, "input");
    }
    if (role === "output" || role === "both") {
      addTraceToken(tokenStates, relatedRow.output, "output");
    }
  }

  return { tokenStates, rowStates };
}

export function togglePinnedTrace(
  current: PinnedTrace | null,
  rowId: string,
  event: MouseEvent<HTMLElement>
): PinnedTrace | null {
  const mode = event.metaKey || event.ctrlKey ? "inputs" : event.shiftKey ? "outputs" : "both";
  if (current?.rowId === rowId && current.mode === mode) {
    return null;
  }
  return { rowId, mode };
}

function addTraceToken(
  tokenStates: Map<string, TraceTokenRole>,
  token: string | null,
  nextRole: TraceTokenRole
): void {
  if (!token) {
    return;
  }
  const currentRole = tokenStates.get(token);
  tokenStates.set(token, mergeTraceRole(currentRole, nextRole));
}

function mergeRowTrace(
  rowStates: Map<string, TraceRowRole>,
  rowId: string,
  nextRole: Exclude<TraceRowRole, "root">
): void {
  const currentRole = rowStates.get(rowId);
  if (!currentRole) {
    rowStates.set(rowId, nextRole);
    return;
  }
  if (currentRole === "root" || currentRole === nextRole || currentRole === "both") {
    return;
  }
  rowStates.set(rowId, "both");
}

function mergeTraceRole(
  currentRole: TraceTokenRole | undefined,
  nextRole: TraceTokenRole
): TraceTokenRole {
  if (!currentRole || currentRole === nextRole) {
    return nextRole;
  }
  if (currentRole === "both" || nextRole === "both") {
    return "both";
  }
  if (currentRole === "root") {
    return nextRole === "root" ? "root" : nextRole;
  }
  if (nextRole === "root") {
    return currentRole;
  }
  return "both";
}

function normalizeVariableName(source: string): string | null {
  const trimmed = source.trim();
  return /^[A-Za-z_][A-Za-z0-9_.^{}]*$/.test(trimmed) ? trimmed : null;
}

function extractVariableTokens(source: string): string[] {
  const tokens = new Set<string>();
  const tokenPattern = /[A-Za-z_][A-Za-z0-9_.^{}]*/g;

  for (const match of source.matchAll(tokenPattern)) {
    const token = match[0];
    const nextIndex = (match.index ?? 0) + token.length;
    if (token === "gnd" || isFunctionCall(source, nextIndex)) {
      continue;
    }
    tokens.add(token);
  }

  return [...tokens];
}

function isFunctionCall(source: string, nextIndex: number): boolean {
  for (let index = nextIndex; index < source.length; index += 1) {
    const character = source[index];
    if (character.trim() === "") {
      continue;
    }
    return character === "(";
  }
  return false;
}
