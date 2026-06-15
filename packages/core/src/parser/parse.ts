import type { Expr } from "./ast";
import { normalizeDerivativeBalanceTarget } from "./equationTarget";
import { collectCurrentDependencies, collectLagDependencies } from "./dependencies";
import { expressionParseError, rethrowExpressionParseError } from "./parseErrors";
import type { Token, TokenType } from "./parseTokens";

export { describeParseToken, formatExpressionSnippet, formatMatrixColumnCellParseError } from "./parseErrors";
export type { Token, TokenType } from "./parseTokens";

export {
  derivativeBalanceStockName,
  equationDefinesVariable,
  equationOutputVariable,
  isDerivativeBalanceTarget,
  normalizeDerivativeBalanceTarget,
  type NormalizedEquationTarget
} from "./equationTarget";

export interface ParsedEquation {
  name: string;
  expression: Expr;
  sourceExpression: Expr;
  currentDependencies: string[];
  lagDependencies: string[];
}

const IDENTIFIER_SOURCE = String.raw`[A-Za-z_][A-Za-z0-9_\.\^\{\}]*`;
const LAG_PATTERN = new RegExp(`(${IDENTIFIER_SOURCE})\\[-1\\]`, "g");
const PRIME_LAG_PATTERN = new RegExp(`(${IDENTIFIER_SOURCE})'`, "g");
const DIFF_PATTERN = new RegExp(`\\bd\\(\\s*(${IDENTIFIER_SOURCE})\\s*\\)`, "g");

class Lexer {
  private index = 0;

  constructor(private readonly source: string) {}

  nextToken(): Token {
    this.skipWhitespace();
    const offset = this.index;
    if (this.index >= this.source.length) {
      return { type: "EOF", text: "", offset };
    }

    const c = this.source[this.index];

    switch (c) {
      case "+":
        return this.single("PLUS", offset);
      case "-":
        return this.single("MINUS", offset);
      case "*":
        return this.single("STAR", offset);
      case "/":
        return this.single("SLASH", offset);
      case "(":
        return this.single("LPAREN", offset);
      case ")":
        return this.single("RPAREN", offset);
      case "{":
        return this.single("LBRACE", offset);
      case "}":
        return this.single("RBRACE", offset);
      case ",":
        return this.single("COMMA", offset);
      case ">":
        return this.match("=", "GTE", "GT", offset);
      case "<":
        return this.match("=", "LTE", "LT", offset);
      case "=":
        if (this.peekNext() === "=") {
          this.index += 2;
          return { type: "EQEQ", text: "==", offset };
        }
        throw new Error(`Unexpected character: =`);
      case "!":
        if (this.peekNext() === "=") {
          this.index += 2;
          return { type: "NEQ", text: "!=", offset };
        }
        throw new Error(`Unexpected character: !`);
      case "&":
        if (this.peekNext() === "&") {
          this.index += 2;
          return { type: "ANDAND", text: "&&", offset };
        }
        throw new Error(`Unexpected character: &`);
      case "|":
        if (this.peekNext() === "|") {
          this.index += 2;
          return { type: "OROR", text: "||", offset };
        }
        throw new Error(`Unexpected character: |`);
      default:
        if (isNumberStart(c)) {
          return this.number(offset);
        }
        if (isIdentifierStart(c)) {
          return this.identifier(offset);
        }
        throw new Error(`Unexpected character: ${c}`);
    }
  }

  private skipWhitespace(): void {
    while (this.index < this.source.length && /\s/.test(this.source[this.index] ?? "")) {
      this.index += 1;
    }
  }

  private single(type: TokenType, offset: number): Token {
    const text = this.source[this.index] ?? "";
    this.index += 1;
    return { type, text, offset };
  }

  private number(offset: number): Token {
    const start = this.index;
    while (this.index < this.source.length) {
      const c = this.source[this.index] ?? "";
      if (/[0-9.]/.test(c)) {
        this.index += 1;
      } else {
        break;
      }
    }
    return { type: "NUMBER", text: this.source.slice(start, this.index), offset };
  }

  private identifier(offset: number): Token {
    const start = this.index;
    while (this.index < this.source.length) {
      const c = this.source[this.index] ?? "";
      if (/[A-Za-z0-9_.^{}]/.test(c)) {
        this.index += 1;
      } else {
        break;
      }
    }

    const text = this.source.slice(start, this.index);
    if (text === "if") {
      return { type: "IF", text, offset };
    }
    if (text === "else") {
      return { type: "ELSE", text, offset };
    }
    return { type: "IDENTIFIER", text, offset };
  }

  private match(expectedNext: string, matched: TokenType, single: TokenType, offset: number): Token {
    if (this.peekNext() === expectedNext) {
      this.index += 2;
      return { type: matched, text: this.source.slice(this.index - 2, this.index), offset };
    }
    this.index += 1;
    return { type: single, text: this.source.slice(this.index - 1, this.index), offset };
  }

  private peekNext(): string {
    return this.source[this.index + 1] ?? "\0";
  }
}

class Parser {
  private current: Token;

  constructor(private readonly source: string) {
    const lexer = new Lexer(source);
    this.lexer = lexer;
    this.current = lexer.nextToken();
  }

  private readonly lexer: Lexer;

  private failUnexpected(): never {
    throw expressionParseError(this.source, this.current, "unexpected");
  }

  private failExpected(expected: string): never {
    throw expressionParseError(this.source, this.current, "expected", expected);
  }

  parseTopLevelExpression(): Expr {
    if (this.peekType() === "IF") {
      return this.parseIfExpression();
    }
    return this.parseLogicalOr();
  }

  expect(expected: TokenType): Token {
    if (this.current.type !== expected) {
      this.failExpected(expected);
    }
    const token = this.current;
    this.advance();
    return token;
  }

  private parseIfExpression(): Expr {
    this.expect("IF");
    this.expect("LPAREN");
    const condition = this.parseLogicalOr();
    this.expect("RPAREN");
    this.expect("LBRACE");
    const whenTrue = this.parseTopLevelExpression();
    this.expect("RBRACE");
    this.expect("ELSE");
    this.expect("LBRACE");
    const whenFalse = this.parseTopLevelExpression();
    this.expect("RBRACE");
    return { type: "If", condition, whenTrue, whenFalse };
  }

  private parseLogicalOr(): Expr {
    let expression = this.parseLogicalAnd();
    while (this.current.type === "OROR") {
      this.advance();
      const right = this.parseLogicalAnd();
      expression = { type: "Binary", op: "||", left: expression, right };
    }
    return expression;
  }

  private parseLogicalAnd(): Expr {
    let expression = this.parseEquality();
    while (this.current.type === "ANDAND") {
      this.advance();
      const right = this.parseEquality();
      expression = { type: "Binary", op: "&&", left: expression, right };
    }
    return expression;
  }

  private parseEquality(): Expr {
    let expression = this.parseComparison();
    while (this.current.type === "EQEQ" || this.current.type === "NEQ") {
      const op = this.current.type === "EQEQ" ? "==" : "!=";
      this.advance();
      const right = this.parseComparison();
      expression = { type: "Binary", op, left: expression, right };
    }
    return expression;
  }

  private parseComparison(): Expr {
    let expression = this.parseAdditive();
    while (
      this.current.type === "GT" ||
      this.current.type === "GTE" ||
      this.current.type === "LT" ||
      this.current.type === "LTE"
    ) {
      const op = tokenTypeToComparisonOperator(this.current.type);
      this.advance();
      const right = this.parseAdditive();
      expression = { type: "Binary", op, left: expression, right };
    }
    return expression;
  }

  private parseAdditive(): Expr {
    let expression = this.parseMultiplicative();
    while (this.current.type === "PLUS" || this.current.type === "MINUS") {
      const op = this.current.type === "PLUS" ? "+" : "-";
      this.advance();
      const right = this.parseMultiplicative();
      expression = { type: "Binary", op, left: expression, right };
    }
    return expression;
  }

  private parseMultiplicative(): Expr {
    let expression = this.parseUnary();
    while (this.current.type === "STAR" || this.current.type === "SLASH") {
      const op = this.current.type === "STAR" ? "*" : "/";
      this.advance();
      const right = this.parseUnary();
      expression = { type: "Binary", op, left: expression, right };
    }
    return expression;
  }

  private parseUnary(): Expr {
    if (this.current.type === "MINUS") {
      this.advance();
      return { type: "Unary", op: "-", expr: this.parseUnary() };
    }

    return this.parsePrimary();
  }

  private parsePrimary(): Expr {
    if (this.peekType() === "NUMBER") {
      const value = Number(this.current.text);
      this.advance();
      return { type: "Number", value };
    }

    if (this.peekType() === "IDENTIFIER") {
      const identifier = this.expect("IDENTIFIER").text;
      if (this.peekType() === "LPAREN") {
        return this.parseFunctionCall(identifier);
      }
      return { type: "Variable", name: identifier };
    }

    if (this.peekType() === "LPAREN") {
      this.advance();
      const expression = this.parseTopLevelExpression();
      this.expect("RPAREN");
      return expression;
    }

    this.failUnexpected();
  }

  private parseFunctionCall(identifier: string): Expr {
    this.expect("LPAREN");
    switch (identifier) {
      case "lag": {
        const argument = this.expect("IDENTIFIER").text;
        this.expect("RPAREN");
        return { type: "Lag", name: argument };
      }
      case "diff": {
        const argument = this.expect("IDENTIFIER").text;
        this.expect("RPAREN");
        return { type: "Diff", name: argument };
      }
      case "I": {
        if (this.peekType() === "RPAREN") {
          throw new Error("I(...) requires a flow expression.");
        }
        const argument = this.parseTopLevelExpression();
        this.expect("RPAREN");
        return { type: "Integral", expr: argument };
      }
      case "sum": {
        const argument = this.expect("IDENTIFIER").text;
        this.expect("RPAREN");
        return { type: "MatrixColumnSum", columnRef: argument };
      }
      case "exp":
      case "log":
      case "abs":
      case "sqrt": {
        const argument = this.parseTopLevelExpression();
        this.expect("RPAREN");
        return { type: "Function", name: identifier, args: [argument] };
      }
      case "min":
      case "max": {
        const first = this.parseTopLevelExpression();
        this.expect("COMMA");
        const second = this.parseTopLevelExpression();
        this.expect("RPAREN");
        return { type: "Function", name: identifier, args: [first, second] };
      }
      case "pow": {
        const base = this.parseTopLevelExpression();
        this.expect("COMMA");
        const exponent = this.parseTopLevelExpression();
        this.expect("RPAREN");
        return { type: "Function", name: identifier, args: [base, exponent] };
      }
      default:
        throw new Error(`Unsupported function: ${identifier}`);
    }
  }

  private advance(): void {
    this.current = this.lexer.nextToken();
  }

  private peekType(): TokenType {
    return this.current.type;
  }
}

export function parseExpression(source: string): Expr {
  const normalized = normalize(source);
  try {
    const parser = new Parser(normalized);
    const expression = parser.parseTopLevelExpression();
    parser.expect("EOF");
    return expression;
  } catch (error) {
    rethrowExpressionParseError(error, normalized);
  }
}

export function parseEquation(
  name: string,
  source: string,
  options?: { matrixColumnSums?: Record<string, string[]> }
): ParsedEquation {
  const { name: equationName, source: equationSource } = normalizeDerivativeBalanceTarget(
    name,
    source
  );
  let sourceExpression: Expr;
  try {
    sourceExpression = parseExpression(equationSource);
  } catch (error) {
    rethrowExpressionParseError(error, normalize(equationSource), { equationName });
  }
  const expression = lowerIntegrals(equationName, sourceExpression);
  const matrixColumnSums = options?.matrixColumnSums;
  return {
    name: equationName,
    expression,
    sourceExpression,
    currentDependencies: Array.from(collectCurrentDependencies(expression, matrixColumnSums)),
    lagDependencies: Array.from(collectLagDependencies(expression, matrixColumnSums))
  };
}

function lowerIntegrals(equationName: string, expression: Expr): Expr {
  if (expression.type === "Integral") {
    return {
      type: "Binary",
      op: "+",
      left: { type: "Lag", name: equationName },
      right: {
        type: "Binary",
        op: "*",
        left: expression.expr,
        right: { type: "Variable", name: "dt" }
      }
    };
  }

  if (containsIntegral(expression)) {
    throw new Error(
      "I(...) is only supported as the outermost RHS form of an equation, e.g. Bs = I(flowExpr)."
    );
  }

  return expression;
}

function containsIntegral(expression: Expr): boolean {
  switch (expression.type) {
    case "Integral":
      return true;
    case "Unary":
      return containsIntegral(expression.expr);
    case "Binary":
      return containsIntegral(expression.left) || containsIntegral(expression.right);
    case "If":
      return (
        containsIntegral(expression.condition) ||
        containsIntegral(expression.whenTrue) ||
        containsIntegral(expression.whenFalse)
      );
    case "Function":
      return expression.args.some((arg) => containsIntegral(arg));
    case "MatrixColumnSum":
      return false;
    case "Number":
    case "Variable":
    case "Lag":
    case "Diff":
      return false;
  }
}

function normalize(source: string): string {
  return source
    .replace(/•/g, "*")
    .replace(LAG_PATTERN, "lag($1)")
    .replace(PRIME_LAG_PATTERN, "lag($1)")
    .replace(DIFF_PATTERN, "diff($1)");
}

function isNumberStart(char: string): boolean {
  return /[0-9.]/.test(char);
}

function isIdentifierStart(char: string): boolean {
  return /[A-Za-z_]/.test(char);
}

function tokenTypeToComparisonOperator(
  type: "GT" | "GTE" | "LT" | "LTE"
): ">" | ">=" | "<" | "<=" {
  switch (type) {
    case "GT":
      return ">";
    case "GTE":
      return ">=";
    case "LT":
      return "<";
    case "LTE":
      return "<=";
  }
}
