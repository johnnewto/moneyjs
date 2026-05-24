import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";

import {
  derivativeBalanceStockName,
  isDerivativeBalanceTarget,
  type EquationRole
} from "@sfcr/core";
import type { EquationRow, ValidationIssue } from "../lib/editorModel";
import type { VariableDescriptions } from "../lib/variableDescriptions";
import {
  normalizeSignature,
  resolveVariableTooltip,
  type StockFlowKind,
  type UnitMeta,
  type VariableUnitMetadata
} from "../lib/unitMeta";
import {
  BASE_DIMENSION_OPTIONS,
  applyStockFlowToUnitDraft,
  normalizeUnitPickerForm,
  signatureToUnitPickerForm,
  unitPickerFormToSignature,
  type UnitPickerForm,
  type UnitPickerOperand,
  type UnitPickerShape
} from "../lib/unitPicker";
import { getEquationRowUnitLabel, getVariableUnitLabel, suggestEquationUnitMeta } from "../lib/units";
import {
  buildActiveTrace,
  buildTraceModel,
  togglePinnedTrace,
  type PinnedTrace,
  type TraceTokenRole
} from "./EquationTrace";
import { useEquationGridColumnResize } from "../hooks/useEquationGridColumnResize";
import { InstantTooltip } from "./InstantTooltip";
import { renderVariableMathLabel } from "./VariableMathLabel";

export {
  buildActiveTrace,
  buildTraceModel,
  togglePinnedTrace,
  type ActiveTrace,
  type PinnedTrace,
  type TraceModel,
  type TraceTokenRole
} from "./EquationTrace";

interface EquationGridEditorProps {
  buildError?: string | null;
  currentValues?: Record<string, number | undefined>;
  equations: EquationRow[];
  issues: Record<string, string | ValidationIssue | undefined>;
  isEmbedded?: boolean;
  onChange(next: EquationRow[]): void;
  onSelectVariable?(variableName: string): void;
  parameterNames?: string[];
  showHeading?: boolean;
  showTraceHelp?: boolean;
  variableDescriptions?: VariableDescriptions;
  variableUnitMetadata?: VariableUnitMetadata;
}

export function EquationGridEditor({
  buildError = null,
  currentValues = {},
  equations,
  issues,
  isEmbedded = false,
  onChange,
  onSelectVariable,
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
  const [openPopover, setOpenPopover] = useState<{ kind: "unit" | "role"; rowId: string } | null>(
    null
  );
  const columnResize = useEquationGridColumnResize({ isEmbedded });

  const activeTrace = pinnedTrace
    ? buildActiveTrace(traceModel, pinnedTrace.rowId, pinnedTrace.mode)
    : hoveredRowId
      ? buildActiveTrace(traceModel, hoveredRowId, "inputs")
      : null;
  const showHeader = showHeading || showTraceHelp;

  useEffect(() => {
    if (!openPopover) {
      return undefined;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Element)) {
        setOpenPopover(null);
        return;
      }

      if (event.target.closest(".input-badge-popover, .equation-grid-role-cell")) {
        return;
      }

      setOpenPopover(null);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [openPopover]);

  return (
    <section className={isEmbedded ? "equation-grid-editor-embedded" : "editor-panel"}>
      {showHeader ? (
        <div className="panel-header">
          <div>
            {showHeading ? <h2>Equations</h2> : null}
            {showTraceHelp ? (
              <p className="panel-subtitle">
                Hover previews inputs. Click shows both, Shift+click pins outputs, Ctrl/Cmd+click pins inputs.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {buildError ? <div className="error-text equation-grid-banner">{buildError}</div> : null}

      <div
        ref={columnResize.shellRef}
        className={`equation-grid-shell${columnResize.shellClassName ? ` ${columnResize.shellClassName}` : ""}`.trim()}
      >
        <div className="equation-grid-header" role="row">
          <span>#</span>
          <span ref={columnResize.variableHeaderRef}>Variable</span>
          <span ref={columnResize.expressionHeaderRef}>Expression</span>
          <span>Role</span>
          <span>Description</span>
          <span>Status</span>
          <span />
          <div {...columnResize.variableResizeHandleProps} />
          <div {...columnResize.expressionResizeHandleProps} />
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
                      event.target.closest("textarea,input,button,select")
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
                    footer={
                      <EquationUnitsPopover
                        expression={equation.expression}
                        isOpen={openPopover?.kind === "unit" && openPopover.rowId === equation.id}
                        onChange={(unitMeta) => updateRow(equations, index, { unitMeta }, onChange)}
                        onToggle={() =>
                          setOpenPopover((current) =>
                            current?.kind === "unit" && current.rowId === equation.id
                              ? null
                              : { kind: "unit", rowId: equation.id }
                          )
                        }
                        unitMeta={equation.unitMeta ?? variableUnitMetadata?.get(equation.name.trim())}
                        variableName={equation.name}
                        variableUnitMetadata={variableUnitMetadata}
                      />
                    }
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
                    currentValues={currentValues}
                    onSelectVariable={onSelectVariable}
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
                    currentValues={currentValues}
                    onSelectVariable={onSelectVariable}
                    variableDescriptions={variableDescriptions}
                    variableUnitMetadata={variableUnitMetadata}
                  />
                  <EquationRolePopover
                    isOpen={openPopover?.kind === "role" && openPopover.rowId === equation.id}
                    onChange={(role) => updateRow(equations, index, { role }, onChange)}
                    onToggle={() =>
                      setOpenPopover((current) =>
                        current?.kind === "role" && current.rowId === equation.id
                          ? null
                          : { kind: "role", rowId: equation.id }
                      )
                    }
                    role={equation.role}
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

const EQUATION_ROLE_OPTIONS: Array<{ value: EquationRole; label: string }> = [
  { value: "accumulation", label: "Accumulation" },
  { value: "identity", label: "Identity" },
  { value: "target", label: "Target" },
  { value: "definition", label: "Definition" },
  { value: "behavioral", label: "Behavioral" }
];

export interface HighlightedFormulaInputProps {
  ariaLabel: string;
  className?: string;
  currentValues?: Record<string, number | undefined>;
  displayTokens?: Map<string, string>;
  footer?: ReactNode;
  highlightedTokens?: Map<string, TraceTokenRole>;
  inputRef(node: HTMLTextAreaElement | null): void;
  onBlur?(): void;
  onChange(value: string): void;
  onEnter(): void;
  onSelectVariable?(variableName: string): void;
  parameterNames: Set<string>;
  placeholder: string;
  value: string;
  variableDescriptions?: VariableDescriptions;
  variableUnitMetadata?: VariableUnitMetadata;
}

function EquationUnitsPopover({
  expression,
  isOpen,
  onChange,
  onToggle,
  unitMeta,
  variableName,
  variableUnitMetadata
}: {
  expression: string;
  isOpen: boolean;
  onChange: (unitMeta: UnitMeta | undefined) => void;
  onToggle: () => void;
  unitMeta?: UnitMeta;
  variableName: string;
  variableUnitMetadata?: VariableUnitMetadata;
}) {
  const normalized = unitMeta ? { ...unitMeta, signature: normalizeSignature(unitMeta.signature) } : undefined;
  const unitLabel = getEquationRowUnitLabel(variableName, normalized) ?? "Set units";
  const derivativeBalanceStock = derivativeBalanceStockName(variableName);
  const [draft, setDraft] = useState(() => createUnitDialogDraft(normalized));
  const draftSignatureKey = JSON.stringify(normalized?.signature ?? null);
  const draftStockFlow = normalized?.stockFlow ?? null;
  const suggestion = useMemo(
    () =>
      suggestEquationUnitMeta({
        variableName,
        expression,
        variableUnitMetadata: variableUnitMetadata ?? new Map()
      }),
    [variableName, expression, variableUnitMetadata]
  );
  const canSuggest = suggestion != null;

  useEffect(() => {
    if (isOpen) {
      setDraft(createUnitDialogDraft(normalized));
    }
  }, [isOpen, draftSignatureKey, draftStockFlow]);

  const applyPickerChange = (nextForm: UnitPickerForm) => {
    setDraft((current) => ({
      ...current,
      pickerForm: normalizeUnitPickerForm(nextForm)
    }));
  };

  const handleApply = () => {
    onChange(buildUnitMetaFromPicker(undefined, draft.pickerForm, draft.stockFlow));
    onToggle();
  };

  const handleCancel = () => {
    onToggle();
  };

  const handleClearUnit = () => {
    setDraft((current) => ({
      ...current,
      pickerForm: { ...current.pickerForm, shape: "none" }
    }));
  };

  const handleSuggest = () => {
    if (!suggestion) {
      return;
    }

    setDraft((current) => ({
      stockFlow: suggestion.stockFlow ?? current.stockFlow,
      pickerForm: normalizeUnitPickerForm(signatureToUnitPickerForm(suggestion.signature))
    }));
  };

  return (
    <span className={`input-badge-popover input-unit-badge${isOpen ? " is-open" : ""}`.trim()}>
      <button
        aria-expanded={isOpen ? "true" : "false"}
        aria-label={`Edit units for ${variableName.trim() || "equation variable"}`}
        className="equation-badge-button unit-badge"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onToggle();
        }}
        type="button"
      >
        {unitLabel}
      </button>
      {isOpen ? (
        <div
          className="equation-badge-popover-panel equation-unit-picker-panel"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="equation-unit-picker-header">
            <button
              aria-label="Suggest units from expression"
              className="equation-unit-picker-action secondary-button"
              disabled={!canSuggest}
              onClick={handleSuggest}
              type="button"
            >
              Suggest
            </button>
          </div>
          {isDerivativeBalanceTarget(variableName) && derivativeBalanceStock && normalized?.signature ? (
            <p className="equation-unit-picker-note">
              Defines stock {derivativeBalanceStock} (
              {getEquationRowUnitLabel(derivativeBalanceStock, normalized) ?? "units"}). The badge
              shows the per-year change.
            </p>
          ) : null}
          <label className="equation-badge-popover-field">
            <span>Kind</span>
            <select
              aria-label="Unit stock-flow kind"
              onChange={(event) => {
                const stockFlow = normalizeStockFlowKind(event.target.value);
                setDraft((current) => ({
                  ...current,
                  stockFlow,
                  pickerForm: applyStockFlowToUnitDraft({
                    currentPickerForm: current.pickerForm,
                    stockFlow
                  })
                }));
              }}
              value={draft.stockFlow ?? ""}
            >
              <option value="">None</option>
              <option value="stock">Stock</option>
              <option value="flow">Flow</option>
              <option value="aux">Aux</option>
            </select>
          </label>
          <label className="equation-badge-popover-field">
            <span>Unit</span>
            <select
              aria-label="Unit structure"
              onChange={(event) =>
                applyPickerChange({
                  ...draft.pickerForm,
                  shape: event.target.value as UnitPickerShape
                })
              }
              value={draft.pickerForm.shape}
            >
              <option value="none">None</option>
              <option value="single">Single</option>
              <option value="multiply">Multiply</option>
              <option value="divide">Divide</option>
            </select>
          </label>
          {draft.pickerForm.shape === "single" ? (
            <label className="equation-badge-popover-field">
              <span>Dimension</span>
              <select
                aria-label="Single unit dimension"
                onChange={(event) =>
                  applyPickerChange({
                    ...draft.pickerForm,
                    singleDimension: event.target.value as UnitPickerForm["singleDimension"]
                  })
                }
                value={draft.pickerForm.singleDimension}
              >
                {BASE_DIMENSION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {draft.pickerForm.shape === "multiply" || draft.pickerForm.shape === "divide" ? (
            <div className="equation-unit-picker-operands">
              <label className="equation-badge-popover-field">
                <span>{draft.pickerForm.shape === "divide" ? "Numerator" : "Left"}</span>
                <select
                  aria-label={draft.pickerForm.shape === "divide" ? "Unit numerator" : "Unit left operand"}
                  onChange={(event) =>
                    applyPickerChange({
                      ...draft.pickerForm,
                      leftOperand: event.target.value as UnitPickerOperand
                    })
                  }
                  value={draft.pickerForm.leftOperand}
                >
                  {draft.pickerForm.shape === "divide" ? <option value="none">1</option> : null}
                  {BASE_DIMENSION_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <span aria-hidden="true" className="equation-unit-picker-operator">
                {draft.pickerForm.shape === "multiply" ? "×" : "÷"}
              </span>
              <label className="equation-badge-popover-field">
                <span>{draft.pickerForm.shape === "divide" ? "Denominator" : "Right"}</span>
                <select
                  aria-label={draft.pickerForm.shape === "divide" ? "Unit denominator" : "Unit right operand"}
                  onChange={(event) =>
                    applyPickerChange({
                      ...draft.pickerForm,
                      rightOperand: event.target.value as UnitPickerForm["rightOperand"]
                    })
                  }
                  value={draft.pickerForm.rightOperand}
                >
                  {(draft.pickerForm.shape === "multiply"
                    ? BASE_DIMENSION_OPTIONS.filter((option) => option.value !== draft.pickerForm.leftOperand)
                    : draft.pickerForm.leftOperand === "none"
                      ? BASE_DIMENSION_OPTIONS
                      : BASE_DIMENSION_OPTIONS.filter((option) => option.value !== draft.pickerForm.leftOperand)
                  ).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}
          <div className="equation-unit-picker-actions">
            <button className="equation-unit-picker-action" onClick={handleApply} type="button">
              Apply
            </button>
            <button className="equation-unit-picker-action secondary-button" onClick={handleCancel} type="button">
              Cancel
            </button>
            <button
              className="equation-unit-picker-action equation-unit-picker-clear"
              onClick={handleClearUnit}
              type="button"
            >
              Clear unit
            </button>
          </div>
        </div>
      ) : null}
    </span>
  );
}

function EquationRolePopover({
  isOpen,
  onChange,
  onToggle,
  role
}: {
  isOpen: boolean;
  onChange: (role: EquationRole | undefined) => void;
  onToggle: () => void;
  role?: EquationRole;
}) {
  return (
    <div className={`equation-grid-role-cell${isOpen ? " is-open" : ""}`.trim()}>
      <button
        aria-expanded={isOpen ? "true" : "false"}
        aria-label="Edit equation role"
        className="equation-badge-button equation-grid-role-select"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onToggle();
        }}
        type="button"
      >
        {getEquationRoleLabel(role)}
      </button>
      {isOpen ? (
        <div
          className="equation-badge-popover-panel equation-role-popover-panel"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="equation-role-popover-options" role="listbox" aria-label="Equation role options">
            <button
              className={`equation-role-option${role == null ? " is-active" : ""}`.trim()}
              onClick={() => onChange(undefined)}
              type="button"
            >
              Auto
            </button>
            {EQUATION_ROLE_OPTIONS.map((option) => (
              <button
                key={option.value}
                className={`equation-role-option${role === option.value ? " is-active" : ""}`.trim()}
                onClick={() => onChange(option.value)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function HighlightedFormulaInput({
  ariaLabel,
  className = "",
  currentValues,
  displayTokens,
  footer,
  highlightedTokens,
  inputRef,
  onBlur,
  onChange,
  onEnter,
  onSelectVariable,
  parameterNames,
  placeholder,
  value,
  variableDescriptions,
  variableUnitMetadata
}: HighlightedFormulaInputProps) {
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
              variableUnitMetadata,
              onSelectVariable,
              displayTokens,
              currentValues
            )
          : placeholder}
      </div>
      <textarea
        aria-label={ariaLabel}
        className="highlighted-formula-control"
        onBlur={() => onBlur?.()}
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
      {footer ??
        (ariaLabel.toLowerCase().includes("variable") && value.trim() ? (
          <span className="unit-badge input-unit-badge">
            {getVariableUnitLabel(variableUnitMetadata ?? new Map(), value.trim())}
          </span>
        ) : null)}
    </label>
  );
}

function createUnitDialogDraft(unitMeta?: UnitMeta): {
  pickerForm: UnitPickerForm;
  stockFlow: StockFlowKind | undefined;
} {
  const normalized = unitMeta ? { ...unitMeta, signature: normalizeSignature(unitMeta.signature) } : undefined;
  return {
    pickerForm: signatureToUnitPickerForm(normalized?.signature),
    stockFlow: normalized?.stockFlow
  };
}

function buildUnitMetaFromPicker(
  unitMeta: UnitMeta | undefined,
  pickerForm: UnitPickerForm,
  stockFlow?: StockFlowKind | undefined
): UnitMeta | undefined {
  const nextSignature = normalizeSignature(unitPickerFormToSignature(pickerForm));
  const nextStockFlow = stockFlow !== undefined ? stockFlow : unitMeta?.stockFlow;

  if (Object.keys(nextSignature).length === 0 && nextStockFlow == null) {
    return undefined;
  }

  return {
    ...(nextStockFlow ? { stockFlow: nextStockFlow } : {}),
    ...(Object.keys(nextSignature).length > 0 ? { signature: nextSignature } : {})
  };
}

function normalizeStockFlowKind(value: string): StockFlowKind | undefined {
  switch (value) {
    case "stock":
    case "flow":
    case "aux":
      return value;
    default:
      return undefined;
  }
}

function getEquationRoleLabel(role?: EquationRole): string {
  return EQUATION_ROLE_OPTIONS.find((option) => option.value === role)?.label ?? "Auto";
}

export function highlightFormula(
  source: string,
  parameterNames: Set<string>,
  highlightedTokens?: Map<string, TraceTokenRole>,
  variableDescriptions?: VariableDescriptions,
  variableUnitMetadata?: VariableUnitMetadata,
  onSelectVariable?: (variableName: string) => void,
  displayTokens?: Map<string, string>,
  currentValues?: Record<string, number | undefined>,
  variableSelectOnClick = false
): ReactNode[] {
  const parts: ReactNode[] = [];
  const tokenPattern =
    /(lag\(\s*([A-Za-z_][A-Za-z0-9_.^{}]*)\s*\))|([A-Za-z_][A-Za-z0-9_.^{}]*|\d+(?:\.\d+)?(?:e[+-]?\d+)?)/gi;
  let lastIndex = 0;

  for (const match of source.matchAll(tokenPattern)) {
    const token = match[0];
    const laggedVariable = match[2];
    const index = match.index ?? 0;

    if (index > lastIndex) {
      parts.push(source.slice(lastIndex, index));
    }

    const normalizedToken = (laggedVariable ?? token).trim();
    const tokenClass = laggedVariable
      ? classifyVariableToken(normalizedToken, parameterNames)
      : classifyToken(token, parameterNames, source, index + token.length);
    const renderedToken =
      laggedVariable
        ? displayTokens?.get(normalizedToken) ?? normalizedToken
        : tokenClass === "formula-parameter"
          ? displayTokens?.get(normalizedToken) ?? token
          : token;
    const renderedTokenNode =
      tokenClass === "formula-function" ||
      tokenClass === "formula-number" ||
      tokenClass === "formula-default"
        ? renderedToken
        : laggedVariable
          ? renderLaggedVariableMathLabel(String(renderedToken))
          : renderVariableMathLabel(String(renderedToken));
    const traceClass = highlightedTokens?.get(normalizedToken) ?? null;
    const hasVariableMetadata =
      variableDescriptions?.has(normalizedToken) || variableUnitMetadata?.has(normalizedToken);
    const tokenDescription =
      tokenClass !== "formula-function" &&
      tokenClass !== "formula-number" &&
      tokenClass !== "formula-default" &&
      hasVariableMetadata
        ? resolveVariableTooltip({
            name: normalizedToken,
            variableDescriptions,
            variableUnitMetadata,
            currentValues
          })
        : undefined;
    const tokenClassName = `formula-token ${tokenClass}${traceClass ? ` trace-token-${traceClass}` : ""}${
      onSelectVariable &&
      tokenClass !== "formula-function" &&
      tokenClass !== "formula-number" &&
      tokenClass !== "formula-default"
        ? " is-clickable"
        : ""
    }`;
    parts.push(
      <InstantTooltip
        key={`${token}-${index}`}
        className={tokenClassName}
        tooltip={tokenDescription}
      >
        <span
          className={tokenClassName}
          {...(variableSelectOnClick
            ? {
                onClick: (event: MouseEvent<HTMLSpanElement>) => {
                  if (
                    !onSelectVariable ||
                    tokenClass === "formula-function" ||
                    tokenClass === "formula-number" ||
                    tokenClass === "formula-default"
                  ) {
                    return;
                  }
                  event.preventDefault();
                  event.stopPropagation();
                  onSelectVariable(normalizedToken);
                }
              }
            : {
                onMouseDown: (event: MouseEvent<HTMLSpanElement>) => {
                  if (
                    !onSelectVariable ||
                    tokenClass === "formula-function" ||
                    tokenClass === "formula-number" ||
                    tokenClass === "formula-default"
                  ) {
                    return;
                  }
                  event.preventDefault();
                  onSelectVariable(normalizedToken);
                }
              })}
        >
          {renderedTokenNode}
        </span>
      </InstantTooltip>
    );
    lastIndex = index + token.length;
  }

  if (lastIndex < source.length) {
    parts.push(source.slice(lastIndex));
  }

  return parts;
}

function renderLaggedVariableMathLabel(name: string): ReactNode[] {
  return [
    ...renderVariableMathLabel(name),
    <sub key={`lag-${name}`} className="lag-subscript">
      -1
    </sub>
  ];
}

function classifyVariableToken(token: string, parameterNames: Set<string>): string {
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

function normalizeEquationRole(value: string): EquationRole | undefined {
  switch (value) {
    case "accumulation":
    case "identity":
    case "target":
    case "definition":
    case "behavioral":
      return value;
    default:
      return undefined;
  }
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
