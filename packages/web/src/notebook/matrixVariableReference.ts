import { parseExpression, type Expr } from "@sfcr/core";

export type MatrixReferenceAccountingPrefix = "" | "+" | "-";

export type MatrixReferenceShape =
  | { kind: "plain"; accountingPrefix: MatrixReferenceAccountingPrefix }
  | { kind: "lag" }
  | { kind: "diff" }
  | { kind: "function"; name: string };

export interface MatrixSimpleVariableReference {
  shape: MatrixReferenceShape;
  variableName: string;
}

function isSimpleReferenceExpr(expr: Expr): boolean {
  switch (expr.type) {
    case "Variable":
    case "Lag":
    case "Diff":
      return true;
    case "Unary":
      return expr.op === "-" && isSimpleReferenceExpr(expr.expr);
    case "Function":
      return expr.args.length === 1 && isSimpleReferenceExpr(expr.args[0]!);
    default:
      return false;
  }
}

function extractPrimaryVariableFromExpr(expr: Expr): string | null {
  switch (expr.type) {
    case "Variable":
      return expr.name;
    case "Lag":
    case "Diff":
      return expr.name;
    case "Unary":
      return expr.op === "-" ? extractPrimaryVariableFromExpr(expr.expr) : null;
    case "Function":
      return expr.args.length === 1 ? extractPrimaryVariableFromExpr(expr.args[0]!) : null;
    default:
      return null;
  }
}

function classifyExprShape(expr: Expr): MatrixReferenceShape | null {
  switch (expr.type) {
    case "Variable":
      return { kind: "plain", accountingPrefix: "" };
    case "Lag":
      return { kind: "lag" };
    case "Diff":
      return { kind: "diff" };
    case "Unary":
      if (expr.op !== "-" || expr.expr.type !== "Variable") {
        return null;
      }
      return { kind: "plain", accountingPrefix: "" };
    case "Function":
      return { kind: "function", name: expr.name };
    default:
      return null;
  }
}

function classifyParsedBody(
  body: string,
  accountingPrefix: MatrixReferenceAccountingPrefix
): MatrixSimpleVariableReference | null {
  const trimmedBody = body.trim();
  if (!trimmedBody) {
    return null;
  }

  try {
    const expr = parseExpression(trimmedBody);
    if (!isSimpleReferenceExpr(expr)) {
      return null;
    }

    const variableName = extractPrimaryVariableFromExpr(expr)?.trim();
    const shape = classifyExprShape(expr);
    if (!variableName || !shape) {
      return null;
    }

    if (shape.kind === "plain") {
      return {
        shape: { kind: "plain", accountingPrefix },
        variableName
      };
    }

    return { shape, variableName };
  } catch {
    return null;
  }
}

export function matrixReferenceShapesMatch(
  left: MatrixSimpleVariableReference,
  right: MatrixSimpleVariableReference
): boolean {
  if (left.shape.kind !== right.shape.kind) {
    return false;
  }

  if (left.shape.kind === "plain" && right.shape.kind === "plain") {
    return left.shape.accountingPrefix === right.shape.accountingPrefix;
  }

  if (left.shape.kind === "function" && right.shape.kind === "function") {
    return left.shape.name === right.shape.name;
  }

  return true;
}

/**
 * Classifies matrix cell sources that denote a single variable reference (optional
 * accounting sign, lag/diff, or one function wrapping one variable). Returns null for
 * expressions, literals, and empty cells.
 */
export function classifyMatrixEntrySource(source: string): MatrixSimpleVariableReference | null {
  const trimmed = source.trim();
  if (!trimmed || trimmed === "0") {
    return null;
  }

  if (trimmed.startsWith("+")) {
    return classifyParsedBody(trimmed.slice(1), "+");
  }

  if (trimmed.startsWith("-")) {
    const inner = classifyParsedBody(trimmed.slice(1), "-");
    if (inner) {
      return inner;
    }
  }

  return classifyParsedBody(trimmed, "");
}
