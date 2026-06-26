import { ParseError } from "../model/schema";

import type { TokenType } from "./parseTokens";

export interface ExpressionParseContext {
  equationName?: string;
  cellLabel?: string;
}

export function describeParseToken(type: TokenType, text: string): string {
  if (type === "EOF") {
    return "end of expression";
  }
  if (text) {
    return `'${text}'`;
  }
  return type;
}

export function formatExpressionSnippet(source: string, maxLength = 96): string {
  const trimmed = source.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxLength - 1)}…`;
}

function expressionParseErrorMessage(
  source: string,
  token: { type: TokenType; text: string; offset: number },
  reason: "unexpected" | "expected",
  expected?: string
): string {
  const tokenLabel = describeParseToken(token.type, token.text);
  const position = token.offset + 1;
  const snippet = formatExpressionSnippet(source);
  const main =
    reason === "unexpected"
      ? `Unexpected ${tokenLabel} at character ${position}`
      : `Expected ${expected ?? "?"} but found ${tokenLabel} at character ${position}`;

  return `${main} in expression '${snippet}'`;
}

function withExpressionParseContext(
  message: string,
  context?: ExpressionParseContext
): string {
  if (context?.equationName) {
    return `Equation '${context.equationName}': ${message}`;
  }
  if (context?.cellLabel) {
    return `${context.cellLabel}: ${message}`;
  }
  return message;
}

export function formatMatrixColumnCellParseError(
  location: {
    matrixTitle: string;
    rowLabel: string;
    columnLabel: string;
  },
  source: string,
  error: unknown
): string {
  const title = location.matrixTitle.trim() || "matrix";
  const row = location.rowLabel.trim() || "row";
  const column = location.columnLabel.trim() || "column";
  const detail = error instanceof Error ? error.message : "Unable to parse expression.";
  const trimmed = source.trim();
  return `Matrix '${title}' cell (${row} / ${column}): ${detail}${
    trimmed ? ` (entry: '${trimmed}')` : ""
  }`;
}

export function expressionParseError(
  source: string,
  token: { type: TokenType; text: string; offset: number },
  reason: "unexpected" | "expected",
  expected?: string,
  context?: ExpressionParseContext
): ParseError {
  const message = withExpressionParseContext(
    expressionParseErrorMessage(source, token, reason, expected),
    context
  );
  return new ParseError(message, context?.equationName, source);
}

export function rethrowExpressionParseError(
  error: unknown,
  source: string,
  context?: ExpressionParseContext
): never {
  if (error instanceof ParseError) {
    if (context?.equationName && !error.message.startsWith(`Equation '${context.equationName}'`)) {
      throw new ParseError(
        withExpressionParseContext(error.message, context),
        context.equationName,
        error.source ?? source
      );
    }
    throw error;
  }

  if (error instanceof Error) {
    throw new ParseError(withExpressionParseContext(error.message, context), context?.equationName, source);
  }

  throw new ParseError(
    withExpressionParseContext("Unable to parse expression.", context),
    context?.equationName,
    source
  );
}
