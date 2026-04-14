import { useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";

import type { EquationRow, ValidationIssue } from "../lib/editorModel";
import type { VariableDescriptions } from "../lib/variableDescriptions";
import { formatVariableTooltip, type VariableUnitMetadata } from "../lib/unitMeta";
import { getVariableUnitLabel } from "../lib/units";
import { InstantTooltip } from "./InstantTooltip";

interface EquationGridEditorProps {
  buildError?: string | null;
  currentValues?: Record<string, number | undefined>;
  equations: EquationRow[];
  issues: Record<string, string | ValidationIssue | undefined>;
  isEmbedded?: boolean;
  onChange(next: EquationRow[]): void;
  parameterNames?: string[];
  showHeading?: boolean;
  showTraceHelp?: boolean;
  variableDescriptions?: VariableDescriptions;
  variableUnitMetadata?: VariableUnitMetadata;
}

export function EquationGridEditor({
  buildError = null,
  currentValues: _currentValues = {},
  equations,
  issues,
  isEmbedded = false,
  onChange,
  parameterNames = [],
  showHeading = true,
  showTraceHelp = true,
  variableDescriptions,
  variableUnitMetadata
}: EquationGridEditorProps) {
  const parameterNameSet = useMemo(() => new Set(parameterNames), [parameterNames]);
  const traceModel = useMemo(() => buildTraceModel(equations), [equations]);
  const variableRefs = useRef<Array<HTMLTextAreaElement | null>>([]);
  const descRefs = useRef<Array<HTMLInputElement | null>>([]);
  const expressionRefs = useRef<Array<HTMLTextAreaElement | null>>([]);
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);
  const [pinnedTrace, setPinnedTrace] = useState<PinnedTrace | null>(null);

  const activeTrace = pinnedTrace
    ? buildActiveTrace(traceModel, pinnedTrace.rowId, pinnedTrace.mode)
    : hoveredRowId
      ? buildActiveTrace(traceModel, hoveredRowId, "inputs")
      : null;
  const showHeader = showHeading || showTraceHelp;

  return (
    <section className={isEmbedded ? "equation-grid-editor-embedded" : "editor-panel"}>
      {showHeader ? (
        <div className="panel-header">
          <div>
            {showHeading ? <h2>Equations</h2> : null}
            {showTraceHelp ? (
              <p className="panel-subtitle">
                Hover previews inputs. Click pins inputs, Shift+click pins outputs, Ctrl/Cmd+click shows both.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {buildError ? <div className="error-text equation-grid-banner">{buildError}</div> : null}

      <div className="equation-grid-shell">
        <div className="equation-grid-header" role="row">
          <span>#</span>
          <span>Variable</span>
          <span>Expression</span>
          <span>Description</span>
          <span>Status</span>
          <span />
        </div>

        <div className="equation-grid-body">
          {equations.map((equation, index) => {
            const issue = resolveEquationIssue(index, issues);
            const issueMessage = issue?.message ?? null;
            const traceRole = activeTrace?.rowStates.get(equation.id) ?? null;
            const rowClassName = [
              "equation-grid-row",
              issueMessage ? "has-issue" : "",
              hoveredRowId === equation.id ? "is-hovered" : "",
              traceRole ? `trace-${traceRole}` : ""
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <div key={equation.id} className="equation-grid-row-group">
                <div
                  className={rowClassName}
                  onClick={(event) => {
                    if (
                      event.target instanceof HTMLElement &&
                      event.target.closest("textarea,input,button")
                    ) {
                      return;
                    }
                    setPinnedTrace((current) =>
                      togglePinnedTrace(current, equation.id, event)
                    );
                  }}
                  onMouseEnter={() => setHoveredRowId(equation.id)}
                  onMouseLeave={() => setHoveredRowId((current) => (current === equation.id ? null : current))}
                  role="row"
                >
                  <span className="equation-grid-index">{index + 1}</span>
                  <HighlightedFormulaInput
                    ariaLabel={`Equation ${index + 1} variable`}
                    className={issues[`equations.${index}.name`] ? "input-error" : ""}
                    highlightedTokens={traceRole ? activeTrace?.tokenStates : undefined}
                    inputRef={(node) => {
                      variableRefs.current[index] = node;
                    }}
                    onChange={(value) =>
                      updateRow(equations, index, { name: value }, onChange)
                    }
                    onEnter={() => descRefs.current[index]?.focus()}
                    parameterNames={parameterNameSet}
                    placeholder="Y"
                    value={equation.name}
                    variableDescriptions={variableDescriptions}
                    variableUnitMetadata={variableUnitMetadata}
                  />
                  <HighlightedFormulaInput
                    ariaLabel={`Equation ${index + 1} expression`}
                    className={issues[`equations.${index}.expression`] ? "input-error" : ""}
                    highlightedTokens={traceRole ? activeTrace?.tokenStates : undefined}
                    inputRef={(node) => {
                      expressionRefs.current[index] = node;
                    }}
                    onChange={(value) =>
                      updateRow(equations, index, { expression: value }, onChange)
                    }
                    onEnter={() => descRefs.current[index]?.focus()}
                    parameterNames={parameterNameSet}
                    placeholder="Cs + Gs"
                    value={equation.expression}
                    variableDescriptions={variableDescriptions}
                  />
                  <input
                    aria-label={`Equation ${index + 1} description`}
                    className="equation-grid-description"
                    onChange={(event) =>
                      updateRow(equations, index, { desc: event.target.value }, onChange)
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        variableRefs.current[index + 1]?.focus();
                      }
                    }}
                    placeholder="Income = GDP"
                    ref={(node) => {
                      descRefs.current[index] = node;
                    }}
                    spellCheck={false}
                    type="text"
                    value={equation.desc ?? ""}
                  />
                  <span
                    className={`equation-grid-status${issueMessage ? " has-issue" : ""}${
                      issue?.severity === "warning" ? " is-warning" : ""
                    }`}
                  >
                    {issue == null ? "OK" : issue.severity === "warning" ? "Warning" : "Error"}
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove equation ${index + 1}`}
                    className="equation-grid-remove-button"
                    onClick={() => onChange(removeRow(equations, index))}
                  >
                    -
                  </button>
                </div>
                {issue != null ? (
                  <div
                    className={`equation-grid-warning-row${
                      issue.severity === "warning" ? " is-warning" : " is-error"
                    }`}
                    role="note"
                  >
                    {issue.message}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <div className="equation-grid-footer">
        <button type="button" onClick={() => onChange([...equations, newEquationRow()])}>
          Add equation
        </button>
      </div>
    </section>
  );
}

interface HighlightedFormulaInputProps {
  ariaLabel: string;
  className?: string;
  footer?: ReactNode;
  highlightedTokens?: Map<string, TraceTokenRole>;
  inputRef(node: HTMLTextAreaElement | null): void;
  onChange(value: string): void;
  onEnter(): void;
  parameterNames: Set<string>;
  placeholder: string;
  value: string;
  variableDescriptions?: VariableDescriptions;
  variableUnitMetadata?: VariableUnitMetadata;
}

function HighlightedFormulaInput({
  ariaLabel,
  className = "",
  footer,
  highlightedTokens,
  inputRef,
  onChange,
  onEnter,
  parameterNames,
  placeholder,
  value,
  variableDescriptions,
  variableUnitMetadata
}: HighlightedFormulaInputProps) {
  const unitLabel =
    ariaLabel.toLowerCase().includes("variable") && value.trim()
      ? getVariableUnitLabel(variableUnitMetadata ?? new Map(), value.trim())
      : null;
  return (
    <label className={`highlighted-formula-input ${className}`.trim()}>
      <div
        aria-hidden="true"
        className={`highlighted-formula-preview${value ? "" : " is-placeholder"}`}
      >
        {value
          ? highlightFormula(
              value,
              parameterNames,
              highlightedTokens,
              variableDescriptions,
              variableUnitMetadata
            )
          : placeholder}
      </div>
      <textarea
        aria-label={ariaLabel}
        className="highlighted-formula-control"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            onEnter();
          }
        }}
        placeholder={placeholder}
        ref={inputRef}
        rows={1}
        spellCheck={false}
        value={value}
      />
      {footer ?? (unitLabel ? <span className="unit-badge input-unit-badge">{unitLabel}</span> : null)}
    </label>
  );
}

export function highlightFormula(
  source: string,
  parameterNames: Set<string>,
  highlightedTokens?: Map<string, TraceTokenRole>,
  variableDescriptions?: VariableDescriptions,
  variableUnitMetadata?: VariableUnitMetadata
): ReactNode[] {
  const parts: ReactNode[] = [];
  const tokenPattern = /([A-Za-z_][A-Za-z0-9_]*|\d+(?:\.\d+)?(?:e[+-]?\d+)?)/gi;
  let lastIndex = 0;

  for (const match of source.matchAll(tokenPattern)) {
    const token = match[0];
    const index = match.index ?? 0;

    if (index > lastIndex) {
      parts.push(source.slice(lastIndex, index));
    }

    const tokenClass = classifyToken(token, parameterNames, source, index + token.length);
    const normalizedToken = token.trim();
    const traceClass = highlightedTokens?.get(normalizedToken) ?? null;
    const hasVariableMetadata =
      variableDescriptions?.has(normalizedToken) || variableUnitMetadata?.has(normalizedToken);
    const tokenDescription =
      tokenClass !== "formula-function" &&
      tokenClass !== "formula-number" &&
      tokenClass !== "formula-default" &&
      hasVariableMetadata
        ? formatVariableTooltip(
            variableDescriptions?.get(normalizedToken),
            variableUnitMetadata?.get(normalizedToken)
          )
        : undefined;
    parts.push(
      <InstantTooltip
        key={`${token}-${index}`}
        className={`formula-token ${tokenClass}${traceClass ? ` trace-token-${traceClass}` : ""}`}
        tooltip={tokenDescription}
      >
        {token}
      </InstantTooltip>
    );
    lastIndex = index + token.length;
  }

  if (lastIndex < source.length) {
    parts.push(source.slice(lastIndex));
  }

  return parts;
}

function classifyToken(
  token: string,
  parameterNames: Set<string>,
  source: string,
  nextIndex: number
): string {
  if (token === "gnd") {
    return "formula-default";
  }
  if (/^\d/.test(token)) {
    return "formula-number";
  }
  if (isFunctionCall(source, nextIndex)) {
    return "formula-function";
  }
  if (parameterNames.has(token)) {
    return "formula-parameter";
  }
  if (/^[A-Z]/.test(token)) {
    return "formula-uppercase";
  }
  if (/^[a-z]/.test(token)) {
    return "formula-lowercase";
  }
  return "formula-default";
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

type TraceMode = "inputs" | "outputs" | "both";
type TraceRowRole = "root" | "input" | "output" | "both";
type TraceTokenRole = "root" | "input" | "output" | "both";

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

export function buildTraceModel(rows: EquationRow[]): TraceModel {
  const traceRows = rows.map((row) => ({
    id: row.id,
    output: normalizeVariableName(row.name),
    inputs: extractVariableTokens(row.expression)
  }));

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
  const mode = event.metaKey || event.ctrlKey ? "both" : event.shiftKey ? "outputs" : "inputs";
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
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed) ? trimmed : null;
}

function extractVariableTokens(source: string): string[] {
  const tokens = new Set<string>();
  const tokenPattern = /[A-Za-z_][A-Za-z0-9_]*/g;

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

function newEquationRow(): EquationRow {
  return {
    id: `eq-${crypto.randomUUID()}`,
    name: "",
    desc: "",
    expression: ""
  };
}

function updateRow(
  rows: EquationRow[],
  index: number,
  patch: Partial<EquationRow>,
  onChange: (next: EquationRow[]) => void
): void {
  onChange(rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
}

function removeRow<T>(rows: T[], index: number): T[] {
  return rows.filter((_, rowIndex) => rowIndex !== index);
}

function resolveEquationIssue(
  index: number,
  issues: Record<string, string | ValidationIssue | undefined>
): ValidationIssue | null {
  const nameIssue = issues[`equations.${index}.name`];
  if (typeof nameIssue === "string") {
    return { path: `equations.${index}.name`, message: nameIssue, severity: "error" };
  }
  if (nameIssue) {
    return nameIssue;
  }

  const expressionIssue = issues[`equations.${index}.expression`];
  if (typeof expressionIssue === "string") {
    return {
      path: `equations.${index}.expression`,
      message: expressionIssue,
      severity: "error"
    };
  }
  return expressionIssue ?? null;
}
