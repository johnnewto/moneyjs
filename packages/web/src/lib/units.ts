import type { Expr } from "@sfcr/core";

import type { EquationRow, ExternalRow } from "./editorModel";
import {
  coerceUnitMeta,
  divideSignatures,
  formatSignature,
  formatUnitText,
  multiplySignatures,
  normalizeSignature,
  signaturesEqual,
  type UnitMeta,
  type UnitSignature,
  type VariableUnitMetadata
} from "./unitMeta";

export interface UnitDiagnostic {
  message: string;
  severity: "error" | "warning";
}

export interface InferredUnit {
  diagnostics: UnitDiagnostic[];
  signature: UnitSignature | null;
}

const DIMENSIONLESS: UnitSignature = {};
const TIME_STEP: UnitSignature = { time: 1 };
const DT_VARIABLE = "dt";

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
  const leftMeta = coerceUnitMeta(variableUnits.get(equationName.trim()));
  const integralDiagnostics = leftMeta
    ? diagnoseIntegralEquation(equationName, expression, leftMeta, variableUnits)
    : null;
  if (integralDiagnostics !== null) {
    return integralDiagnostics;
  }

  const stockAccumulationDiagnostics = leftMeta
    ? diagnoseStockAccumulation(equationName, expression, leftMeta, variableUnits)
    : null;
  if (stockAccumulationDiagnostics !== null) {
    return stockAccumulationDiagnostics;
  }

  const rhs = inferUnits(expression, variableUnits);
  const diagnostics = [...rhs.diagnostics];

  if (!leftMeta?.signature) {
    return diagnostics;
  }

  if (rhs.signature != null && !signaturesEqual(leftMeta.signature, rhs.signature)) {
    diagnostics.push({
      severity: "error",
      message: `Equation '${equationName}' has units ${formatSignature(leftMeta.signature)} but its RHS infers ${formatSignature(rhs.signature)}.`
    });
  }

  return diagnostics;
}

export function inferUnits(expr: Expr, variableUnits: VariableUnitMetadata): InferredUnit {
  switch (expr.type) {
    case "Number":
      return known(DIMENSIONLESS);
    case "Variable":
      if (expr.name === DT_VARIABLE) {
        return known(TIME_STEP);
      }
      return fromMeta(variableUnits.get(expr.name));
    case "Lag":
      if (expr.name === DT_VARIABLE) {
        return known(TIME_STEP);
      }
      return fromMeta(variableUnits.get(expr.name));
    case "Diff": {
      if (expr.name === DT_VARIABLE) {
        return known(DIMENSIONLESS);
      }
      const meta = variableUnits.get(expr.name);
      if (!meta?.signature) {
        return unknown();
      }
      return known(divideSignatures(meta.signature, TIME_STEP));
    }
    case "Integral": {
      const inner = inferUnits(expr.expr, variableUnits);
      if (inner.signature == null) {
        return inner;
      }
      return {
        signature: multiplySignatures(inner.signature, TIME_STEP),
        diagnostics: inner.diagnostics
      };
    }
    case "Unary": {
      const inner = inferUnits(expr.expr, variableUnits);
      return { signature: inner.signature, diagnostics: inner.diagnostics };
    }
    case "If":
      return inferIfUnits(expr, variableUnits);
    case "Function":
      return inferFunctionUnits(expr, variableUnits);
    case "Binary":
      return inferBinaryUnits(expr, variableUnits);
  }
}

function inferIfUnits(
  expr: Extract<Expr, { type: "If" }>,
  variableUnits: VariableUnitMetadata
): InferredUnit {
  const whenTrue = inferUnits(expr.whenTrue, variableUnits);
  const whenFalse = inferUnits(expr.whenFalse, variableUnits);
  const diagnostics = mergeDiagnostics(whenTrue, whenFalse);

  if (whenTrue.signature == null || whenFalse.signature == null) {
    return { signature: null, diagnostics };
  }
  if (!signaturesEqual(whenTrue.signature, whenFalse.signature)) {
    diagnostics.push({
      severity: "error",
      message: `Conditional branches must use matching units, got ${formatSignature(whenTrue.signature)} and ${formatSignature(whenFalse.signature)}.`
    });
    return { signature: null, diagnostics };
  }

  return { signature: whenTrue.signature, diagnostics };
}

function inferFunctionUnits(
  expr: Extract<Expr, { type: "Function" }>,
  variableUnits: VariableUnitMetadata
): InferredUnit {
  switch (expr.name) {
    case "min":
    case "max": {
      const left = inferUnits(expr.args[0] ?? { type: "Number", value: 0 }, variableUnits);
      const right = inferUnits(expr.args[1] ?? { type: "Number", value: 0 }, variableUnits);
      const diagnostics = mergeDiagnostics(left, right);

      if (left.signature == null || right.signature == null) {
        return { signature: null, diagnostics };
      }
      if (!signaturesEqual(left.signature, right.signature)) {
        diagnostics.push({
          severity: "error",
          message: `${expr.name}() arguments must use matching units, got ${formatSignature(left.signature)} and ${formatSignature(right.signature)}.`
        });
        return { signature: null, diagnostics };
      }

      return { signature: left.signature, diagnostics };
    }
    case "abs": {
      const argument = inferUnits(expr.args[0] ?? { type: "Number", value: 0 }, variableUnits);
      return argument;
    }
    case "log":
    case "exp": {
      const argument = inferUnits(expr.args[0] ?? { type: "Number", value: 0 }, variableUnits);
      const diagnostics = [...argument.diagnostics];

      if (argument.signature != null && !signaturesEqual(argument.signature, DIMENSIONLESS)) {
        diagnostics.push({
          severity: "error",
          message: `${expr.name}() requires a dimensionless argument.`
        });
      }

      return { signature: DIMENSIONLESS, diagnostics };
    }
    case "sqrt": {
      const argument = inferUnits(expr.args[0] ?? { type: "Number", value: 0 }, variableUnits);
      const diagnostics = [...argument.diagnostics];

      if (argument.signature == null) {
        return { signature: null, diagnostics };
      }

      const sqrtSignature = normalizeSignature({
        money: (argument.signature.money ?? 0) / 2,
        items: (argument.signature.items ?? 0) / 2,
        time: (argument.signature.time ?? 0) / 2
      });

      return { signature: sqrtSignature, diagnostics };
    }
  }
}

function inferBinaryUnits(
  expr: Extract<Expr, { type: "Binary" }>,
  variableUnits: VariableUnitMetadata
): InferredUnit {
  const stockDifferenceSignature = inferStockDifferenceSignature(expr, variableUnits);
  if (stockDifferenceSignature) {
    return known(stockDifferenceSignature);
  }

  const left = inferUnits(expr.left, variableUnits);
  const right = inferUnits(expr.right, variableUnits);
  const diagnostics = mergeDiagnostics(left, right);

  switch (expr.op) {
    case "+":
    case "-":
      if (left.signature == null || right.signature == null) {
        return { signature: null, diagnostics };
      }
      if (!signaturesEqual(left.signature, right.signature)) {
        diagnostics.push({
          severity: "error",
          message: `Cannot combine ${formatSignature(left.signature)} with ${formatSignature(right.signature)} using '${expr.op}'.`
        });
        return { signature: null, diagnostics };
      }
      return { signature: left.signature, diagnostics };
    case "*":
      if (left.signature == null || right.signature == null) {
        return { signature: null, diagnostics };
      }
      return { signature: multiplySignatures(left.signature, right.signature), diagnostics };
    case "/":
      if (left.signature == null || right.signature == null) {
        return { signature: null, diagnostics };
      }
      return { signature: divideSignatures(left.signature, right.signature), diagnostics };
    case "^":
      if (right.signature != null && !signaturesEqual(right.signature, DIMENSIONLESS)) {
        diagnostics.push({
          severity: "error",
          message: "Exponent must be dimensionless."
        });
      }
      if (left.signature != null && !signaturesEqual(left.signature, DIMENSIONLESS)) {
        diagnostics.push({
          severity: "warning",
          message: "Exponentiation of non-dimensionless quantities is not fully supported."
        });
      }
      return { signature: left.signature, diagnostics };
    case ">":
    case ">=":
    case "<":
    case "<=":
    case "==":
    case "!=":
      if (
        left.signature != null &&
        right.signature != null &&
        !signaturesEqual(left.signature, right.signature)
      ) {
        diagnostics.push({
          severity: "error",
          message: `Comparison requires matching units, got ${formatSignature(left.signature)} and ${formatSignature(right.signature)}.`
        });
      }
      return { signature: DIMENSIONLESS, diagnostics };
    case "&&":
    case "||":
      return { signature: DIMENSIONLESS, diagnostics };
  }
}

function diagnoseStockAccumulation(
  equationName: string,
  expression: Expr,
  leftMeta: UnitMeta,
  variableUnits: VariableUnitMetadata
): UnitDiagnostic[] | null {
  if (leftMeta.stockFlow !== "stock" || !leftMeta.signature) {
    return null;
  }

  const incrementExpr = extractLagAnchorRemainder(expression, equationName.trim());
  if (!incrementExpr) {
    return null;
  }

  const hasExplicitDt = containsDtVariable(incrementExpr);
  const incrementSignature = hasExplicitDt
    ? leftMeta.signature
    : divideSignatures(leftMeta.signature, TIME_STEP);
  const inferred = inferUnits(incrementExpr, variableUnits);
  const diagnostics: UnitDiagnostic[] = [...inferred.diagnostics];

  if (inferred.signature == null) {
    return diagnostics;
  }

  if (!signaturesEqual(inferred.signature, incrementSignature)) {
    diagnostics.push({
      severity: "error",
      message: `Stock '${equationName}' can only combine lag(${equationName}) with increments of ${formatSignature(incrementSignature)}.`
    });
    return diagnostics;
  }

  if (containsStockDifferenceLike(incrementExpr, variableUnits)) {
    diagnostics.push({
      severity: "warning",
      message: `Prefer d(name) instead of stock differences like '${renderExpr(incrementExpr)}' for clearer stock-change notation.`
    });
  }

  if (containsExplicitDiff(incrementExpr) && !hasExplicitDt) {
    diagnostics.push({
      severity: "warning",
      message: `Stock '${equationName}' uses d(name) as a per-year stock-change term. Prefer adding '* dt' explicitly, e.g. lag(${equationName}) + d(name) * dt.`
    });
  } else if (!hasExplicitDt) {
    diagnostics.push({
      severity: "warning",
      message: `Stock '${equationName}' assumes an implicit dt = 1 when adding increment terms.`
    });
  }
  return diagnostics;
}

function diagnoseIntegralEquation(
  equationName: string,
  expression: Expr,
  leftMeta: UnitMeta,
  variableUnits: VariableUnitMetadata
): UnitDiagnostic[] | null {
  if (expression.type !== "Integral") {
    return null;
  }

  const diagnostics: UnitDiagnostic[] = [];

  if (leftMeta.stockFlow !== "stock" || !leftMeta.signature) {
    diagnostics.push({
      severity: "error",
      message: `I(...) should define a stock variable, but '${equationName}' is not marked as a stock.`
    });
    return diagnostics;
  }

  const inner = inferUnits(expression.expr, variableUnits);
  diagnostics.push(...inner.diagnostics);
  if (inner.signature == null) {
    return diagnostics;
  }

  const expectedInner = divideSignatures(leftMeta.signature, TIME_STEP);
  if (!signaturesEqual(inner.signature, expectedInner)) {
    diagnostics.push({
      severity: "error",
      message: `I(...) for stock '${equationName}' expects a flow with units ${formatSignature(expectedInner)}, but got ${formatSignature(inner.signature)}.`
    });
  }

  return diagnostics;
}

function containsDtVariable(expr: Expr): boolean {
  if (
    (expr.type === "Variable" || expr.type === "Lag" || expr.type === "Diff") &&
    expr.name === DT_VARIABLE
  ) {
    return true;
  }
  if (expr.type === "Unary") {
    return containsDtVariable(expr.expr);
  }
  if (expr.type === "Integral") {
    return containsDtVariable(expr.expr);
  }
  if (expr.type === "Binary") {
    return containsDtVariable(expr.left) || containsDtVariable(expr.right);
  }
  if (expr.type === "Function") {
    return expr.args.some((arg) => containsDtVariable(arg));
  }
  if (expr.type === "If") {
    return (
      containsDtVariable(expr.condition) ||
      containsDtVariable(expr.whenTrue) ||
      containsDtVariable(expr.whenFalse)
    );
  }
  return false;
}

function containsExplicitDiff(expr: Expr): boolean {
  if (expr.type === "Diff") {
    return true;
  }
  if (expr.type === "Unary") {
    return containsExplicitDiff(expr.expr);
  }
  if (expr.type === "Integral") {
    return containsExplicitDiff(expr.expr);
  }
  if (expr.type === "Binary") {
    return containsExplicitDiff(expr.left) || containsExplicitDiff(expr.right);
  }
  if (expr.type === "Function") {
    return expr.args.some((arg) => containsExplicitDiff(arg));
  }
  if (expr.type === "If") {
    return (
      containsExplicitDiff(expr.condition) ||
      containsExplicitDiff(expr.whenTrue) ||
      containsExplicitDiff(expr.whenFalse)
    );
  }
  return false;
}

function containsStockDifferenceLike(expr: Expr, variableUnits: VariableUnitMetadata): boolean {
  if (isStockDifferenceLike(expr, variableUnits)) {
    return true;
  }
  if (expr.type === "Unary") {
    return containsStockDifferenceLike(expr.expr, variableUnits);
  }
  if (expr.type === "Integral") {
    return containsStockDifferenceLike(expr.expr, variableUnits);
  }
  if (expr.type === "Binary") {
    return (
      containsStockDifferenceLike(expr.left, variableUnits) ||
      containsStockDifferenceLike(expr.right, variableUnits)
    );
  }
  if (expr.type === "Function" || expr.type === "If") {
    return false;
  }
  return false;
}

function isStockDifferenceLike(expr: Expr, variableUnits: VariableUnitMetadata): boolean {
  if (expr.type !== "Binary" || expr.op !== "-") {
    return false;
  }

  const leftName =
    expr.left.type === "Variable"
      ? expr.left.name
      : expr.left.type === "Lag"
        ? expr.left.name
        : null;
  const rightName =
    expr.right.type === "Variable"
      ? expr.right.name
      : expr.right.type === "Lag"
        ? expr.right.name
        : null;

  if (!leftName || !rightName || leftName !== rightName) {
    return false;
  }

  return (variableUnits.get(leftName)?.stockFlow ?? "aux") === "stock";
}

function inferStockDifferenceSignature(
  expr: Extract<Expr, { type: "Binary" }>,
  variableUnits: VariableUnitMetadata
): UnitSignature | null {
  if (!isStockDifferenceLike(expr, variableUnits)) {
    return null;
  }

  const variableName =
    expr.left.type === "Variable" || expr.left.type === "Lag"
      ? expr.left.name
      : expr.right.type === "Variable" || expr.right.type === "Lag"
        ? expr.right.name
        : null;
  if (!variableName) {
    return null;
  }

  const meta = coerceUnitMeta(variableUnits.get(variableName));
  return meta?.signature ? divideSignatures(meta.signature, TIME_STEP) : null;
}

function extractLagAnchorRemainder(expr: Expr, variableName: string): Expr | null {
  if (expr.type === "Binary" && expr.op === "+") {
    if (expr.left.type === "Lag" && expr.left.name === variableName) {
      return expr.right;
    }
    if (expr.right.type === "Lag" && expr.right.name === variableName) {
      return expr.left;
    }
    const leftRemainder = extractLagAnchorRemainder(expr.left, variableName);
    if (leftRemainder) {
      return { type: "Binary", op: "+", left: leftRemainder, right: expr.right };
    }
    const rightRemainder = extractLagAnchorRemainder(expr.right, variableName);
    if (rightRemainder) {
      return { type: "Binary", op: "+", left: expr.left, right: rightRemainder };
    }
  }

  if (expr.type === "Binary" && expr.op === "-") {
    if (expr.left.type === "Lag" && expr.left.name === variableName) {
      return { type: "Unary", op: "-", expr: expr.right };
    }
    const leftRemainder = extractLagAnchorRemainder(expr.left, variableName);
    if (leftRemainder) {
      return { type: "Binary", op: "-", left: leftRemainder, right: expr.right };
    }
  }

  return null;
}

function renderExpr(expr: Expr): string {
  switch (expr.type) {
    case "Number":
      return String(expr.value);
    case "Variable":
      return expr.name;
    case "Lag":
      return `lag(${expr.name})`;
    case "Diff":
      return `d(${expr.name})`;
    case "Integral":
      return `I(${renderExpr(expr.expr)})`;
    case "Unary":
      return `-${renderExpr(expr.expr)}`;
    case "Binary":
      return `${renderExpr(expr.left)} ${expr.op} ${renderExpr(expr.right)}`;
    case "If":
      return `if (...)`;
    case "Function":
      return `${expr.name}(...)`;
  }
}

function fromMeta(meta?: UnitMeta): InferredUnit {
  const normalizedMeta = coerceUnitMeta(meta);
  if (!normalizedMeta?.signature) {
    return unknown();
  }
  return known(normalizedMeta.signature);
}

function known(signature: UnitSignature): InferredUnit {
  return { signature: normalizeSignature(signature), diagnostics: [] };
}

function unknown(): InferredUnit {
  return { signature: null, diagnostics: [] };
}

function mergeDiagnostics(...parts: InferredUnit[]): UnitDiagnostic[] {
  return parts.flatMap((part) => part.diagnostics);
}

function setVariableUnitMeta(
  metadata: VariableUnitMetadata,
  variableName: string,
  unitMeta?: UnitMeta
): void {
  const normalizedName = variableName.trim();
  const normalizedMeta = coerceUnitMeta(unitMeta);
  if (!normalizedName || metadata.has(normalizedName) || !normalizedMeta?.signature) {
    return;
  }

  metadata.set(normalizedName, {
    signature: normalizeSignature(normalizedMeta.signature),
    stockFlow: normalizedMeta.stockFlow
  });
}
