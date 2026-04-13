import type { Expr } from "@sfcr/core";

import type { EquationRow, ExternalRow } from "./editorModel";
import {
  formatUnitText,
  formatUnitLabel,
  type UnitMeta,
  type VariableUnitMetadata
} from "./unitMeta";

type InferredDimension = "stock" | "flow" | "scalar" | "unknown";

interface InferredUnit {
  baseUnit?: string;
  dimension: InferredDimension;
}

interface DiagnosticState {
  issues: UnitDiagnostic[];
  variableUnits: VariableUnitMetadata;
}

export interface UnitDiagnostic {
  message: string;
  severity: "error" | "warning";
}

const UNKNOWN_UNIT: InferredUnit = { dimension: "unknown" };
const SCALAR_UNIT: InferredUnit = { dimension: "scalar" };

export function buildVariableUnitMetadata(args: {
  equations?: EquationRow[];
  externals?: ExternalRow[];
}): VariableUnitMetadata {
  const metadata: VariableUnitMetadata = new Map();

  for (const equation of args.equations ?? []) {
    setVariableUnitMeta(metadata, equation.name, equation.unitMeta);
  }

  for (const external of args.externals ?? []) {
    setVariableUnitMeta(metadata, external.name, external.unitMeta);
  }

  return metadata;
}

export function getVariableUnitMeta(
  metadata: VariableUnitMetadata,
  variableName: string
): UnitMeta | undefined {
  return metadata.get(variableName.trim());
}

export function getVariableUnitLabel(
  metadata: VariableUnitMetadata,
  variableName: string
): string | null {
  return formatUnitText(getVariableUnitMeta(metadata, variableName));
}

export function getVariableUnitText(
  metadata: VariableUnitMetadata,
  variableName: string
): string | null {
  return formatUnitText(getVariableUnitMeta(metadata, variableName));
}

export function diagnoseEquationUnits(
  equationName: string,
  expression: Expr,
  variableUnits: VariableUnitMetadata
): UnitDiagnostic[] {
  const state: DiagnosticState = { issues: [], variableUnits };
  const leftMeta = variableUnits.get(equationName.trim());

  if (leftMeta?.dimensionKind === "stock" && leftMeta.baseUnit) {
    const accumulationIssue = validateStockAccumulationExpression(
      equationName,
      expression,
      variableUnits
    );
    if (accumulationIssue === null) {
      return state.issues;
    }
    if (accumulationIssue) {
      state.issues.push(accumulationIssue);
      return state.issues;
    }
  }

  inferExpressionUnit(expression, state);
  return state.issues;
}

function validateStockAccumulationExpression(
  equationName: string,
  expression: Expr,
  variableUnits: VariableUnitMetadata
): UnitDiagnostic | null | undefined {
  const terms = flattenAdditiveTerms(expression);
  let anchorCount = 0;
  let hasFlowTerm = false;
  const leftMeta = variableUnits.get(equationName.trim());

  if (!leftMeta?.baseUnit) {
    return undefined;
  }

  for (const term of terms) {
    if (term.sign !== 1) {
      continue;
    }
    if (term.expr.type === "Lag" && term.expr.name === equationName.trim()) {
      anchorCount += 1;
      continue;
    }
  }

  if (anchorCount !== 1) {
    return undefined;
  }

  for (const term of terms) {
    if (term.expr.type === "Lag" && term.expr.name === equationName.trim() && term.sign === 1) {
      continue;
    }

    const inferred = inferExpressionUnit(term.expr, {
      issues: [],
      variableUnits
    });
    if (isDefinitelySameUnit(inferred, { dimension: "stock", baseUnit: leftMeta.baseUnit })) {
      return {
        severity: "warning",
        message: `Stock '${equationName}' should usually accumulate flows around lag(${equationName}). Consider using d(name) for stock-change terms.`
      };
    }
    if (
      inferred.dimension !== "unknown" &&
      inferred.dimension !== "scalar" &&
      !isDefinitelySameUnit(inferred, { dimension: "flow", baseUnit: leftMeta.baseUnit })
    ) {
      return {
        severity: "error",
        message: `Stock '${equationName}' can only combine lag(${equationName}) with ${leftMeta.baseUnit}/yr flow terms.`
      };
    }
    hasFlowTerm = hasFlowTerm || inferred.dimension === "flow";
  }

  return hasFlowTerm ? null : undefined;
}

function inferExpressionUnit(expression: Expr, state: DiagnosticState): InferredUnit {
  switch (expression.type) {
    case "Number":
      return SCALAR_UNIT;
    case "Variable":
      return inferredUnitFromMeta(state.variableUnits.get(expression.name));
    case "Lag":
      return inferredUnitFromMeta(state.variableUnits.get(expression.name));
    case "Diff": {
      const meta = state.variableUnits.get(expression.name);
      if (meta?.dimensionKind === "stock" && meta.baseUnit) {
        return { dimension: "flow", baseUnit: meta.baseUnit };
      }
      return UNKNOWN_UNIT;
    }
    case "Unary":
      return inferExpressionUnit(expression.expr, state);
    case "If": {
      const whenTrue = inferExpressionUnit(expression.whenTrue, state);
      const whenFalse = inferExpressionUnit(expression.whenFalse, state);
        if (isDefiniteMismatch(whenTrue, whenFalse)) {
        state.issues.push({
          severity: "error",
          message: `Conditional branches must use matching units, got ${formatInferredUnit(whenTrue)} and ${formatInferredUnit(whenFalse)}.`
        });
      }
      return mergeCompatibleUnits(whenTrue, whenFalse);
    }
    case "Function": {
      if (expression.name === "min" || expression.name === "max") {
        const left = inferExpressionUnit(expression.args[0] ?? { type: "Number", value: 0 }, state);
        const right = inferExpressionUnit(expression.args[1] ?? { type: "Number", value: 0 }, state);
        if (isDefiniteMismatch(left, right)) {
          state.issues.push({
            severity: "error",
            message: `${expression.name}() arguments must use matching units, got ${formatInferredUnit(left)} and ${formatInferredUnit(right)}.`
          });
        }
        return mergeCompatibleUnits(left, right);
      }
      return UNKNOWN_UNIT;
    }
    case "Binary":
      return inferBinaryUnit(expression, state);
  }
}

function inferBinaryUnit(expression: Extract<Expr, { type: "Binary" }>, state: DiagnosticState): InferredUnit {
  if (isStockDifferenceFlow(expression, state.variableUnits)) {
    const leftName =
      expression.left.type === "Variable"
        ? expression.left.name
        : expression.left.type === "Lag"
          ? expression.left.name
          : expression.right.type === "Variable" || expression.right.type === "Lag"
            ? expression.right.name
            : "";
    const leftMeta = state.variableUnits.get(leftName);
    return leftMeta?.baseUnit ? { dimension: "flow", baseUnit: leftMeta.baseUnit } : UNKNOWN_UNIT;
  }

  const left = inferExpressionUnit(expression.left, state);
  const right = inferExpressionUnit(expression.right, state);

  if (expression.op === "+" || expression.op === "-") {
    if (isDefiniteMismatch(left, right)) {
      state.issues.push({
        severity: "error",
        message: `Cannot combine ${formatInferredUnit(left)} with ${formatInferredUnit(right)} using '${expression.op}'.`
      });
      return UNKNOWN_UNIT;
    }
    return mergeCompatibleUnits(left, right);
  }

  if (
    expression.op === ">" ||
    expression.op === ">=" ||
    expression.op === "<" ||
    expression.op === "<=" ||
    expression.op === "==" ||
    expression.op === "!=" ||
    expression.op === "&&" ||
    expression.op === "||"
  ) {
    return SCALAR_UNIT;
  }

  return UNKNOWN_UNIT;
}

function inferredUnitFromMeta(meta?: UnitMeta): InferredUnit {
  if (!meta?.dimensionKind || meta.dimensionKind === "aux") {
    return UNKNOWN_UNIT;
  }
  return {
    dimension: meta.dimensionKind,
    baseUnit: meta.baseUnit
  };
}

function mergeCompatibleUnits(left: InferredUnit, right: InferredUnit): InferredUnit {
  if (left.dimension === "unknown") {
    return right;
  }
  if (right.dimension === "unknown") {
    return left;
  }
  if (left.dimension === "scalar") {
    return right;
  }
  if (right.dimension === "scalar") {
    return left;
  }
  if (left.dimension === right.dimension && left.baseUnit === right.baseUnit) {
    return left;
  }
  return UNKNOWN_UNIT;
}

function isDefiniteMismatch(left: InferredUnit, right: InferredUnit): boolean {
  if (left.dimension === "unknown" || right.dimension === "unknown") {
    return false;
  }
  if (left.dimension === "scalar" || right.dimension === "scalar") {
    return false;
  }
  return left.dimension !== right.dimension || left.baseUnit !== right.baseUnit;
}

function isDefinitelySameUnit(
  inferred: InferredUnit,
  expected: { dimension: "stock" | "flow"; baseUnit: string }
): boolean {
  return inferred.dimension === expected.dimension && inferred.baseUnit === expected.baseUnit;
}

function formatInferredUnit(unit: InferredUnit): string {
  if (unit.dimension === "unknown") {
    return "unknown units";
  }
  if (unit.dimension === "scalar") {
    return "scalar";
  }
  return formatUnitLabel({ dimensionKind: unit.dimension, baseUnit: unit.baseUnit }) ?? "unknown units";
}

function flattenAdditiveTerms(expression: Expr, sign = 1): Array<{ expr: Expr; sign: 1 | -1 }> {
  if (expression.type === "Binary" && expression.op === "+") {
    return [
      ...flattenAdditiveTerms(expression.left, sign),
      ...flattenAdditiveTerms(expression.right, sign)
    ];
  }
  if (expression.type === "Binary" && expression.op === "-") {
    return [
      ...flattenAdditiveTerms(expression.left, sign),
      ...flattenAdditiveTerms(expression.right, sign === 1 ? -1 : 1)
    ];
  }
  return [{ expr: expression, sign: sign === 1 ? 1 : -1 }];
}

function isStockDifferenceFlow(expression: Extract<Expr, { type: "Binary" }>, variableUnits: VariableUnitMetadata): boolean {
  if (expression.op !== "-") {
    return false;
  }

  if (
    expression.left.type === "Variable" &&
    expression.right.type === "Lag" &&
    expression.left.name === expression.right.name
  ) {
    return variableUnits.get(expression.left.name)?.dimensionKind === "stock";
  }

  if (
    expression.left.type === "Lag" &&
    expression.right.type === "Variable" &&
    expression.left.name === expression.right.name
  ) {
    return variableUnits.get(expression.left.name)?.dimensionKind === "stock";
  }

  return false;
}

function setVariableUnitMeta(
  metadata: VariableUnitMetadata,
  variableName: string,
  unitMeta?: UnitMeta
): void {
  const normalizedName = variableName.trim();
  if (!normalizedName || metadata.has(normalizedName) || !unitMeta?.dimensionKind) {
    return;
  }

  metadata.set(normalizedName, unitMeta);
}
