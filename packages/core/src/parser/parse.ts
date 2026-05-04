import type { Expr } from "./ast";
import { collectCurrentDependencies, collectLagDependencies } from "./dependencies";

export interface ParsedEquation {
  name: string;
  expression: Expr;
  sourceExpression: Expr;
  currentDependencies: string[];
  lagDependencies: string[];
}

type TokenType =
  | "NUMBER"
  | "IDENTIFIER"
  | "IF"
  | "ELSE"
  | "PLUS"
  | "MINUS"
  | "STAR"
  | "SLASH"
  | "LPAREN"
  | "RPAREN"
  | "LBRACE"
  | "RBRACE"
  | "COMMA"
  | "GT"
  | "GTE"
  | "LT"
  | "LTE"
  | "EQEQ"
  | "NEQ"
  | "ANDAND"
  | "OROR"
  | "EOF";

interface Token {
  type: TokenType;
  text: string;
}

const IDENTIFIER_SOURCE = String.raw`[A-Za-z_][A-Za-z0-9_\.\^\{\}]*`;
const LAG_PATTERN = new RegExp(`(${IDENTIFIER_SOURCE})\\[-1\\]`, "g");
const DIFF_PATTERN = new RegExp(`\\bd\\(\\s*(${IDENTIFIER_SOURCE})\\s*\\)`, "g");

class Lexer {
  private index = 0;

  constructor(private readonly source: string) {}

  nextToken(): Token {
    this.skipWhitespace();
    if (this.index >= this.source.length) {
      return { type: "EOF", text: "" };
    }

    const c = this.source[this.index];

    switch (c) {
      case "+":
        return this.single("PLUS");
      case "-":
        return this.single("MINUS");
      case "*":
        return this.single("STAR");
      case "/":
        return this.single("SLASH");
      case "(":
        return this.single("LPAREN");
      case ")":
        return this.single("RPAREN");
      case "{":
        return this.single("LBRACE");
      case "}":
        return this.single("RBRACE");
      case ",":
        return this.single("COMMA");
      case ">":
        return this.match("=", "GTE", "GT");
      case "<":
        return this.match("=", "LTE", "LT");
      case "=":
        if (this.peekNext() === "=") {
          this.index += 2;
          return { type: "EQEQ", text: "==" };
        }
        throw new Error("Unexpected character: =");
      case "!":
        if (this.peekNext() === "=") {
          this.index += 2;
          return { type: "NEQ", text: "!=" };
        }
        throw new Error("Unexpected character: !");
      case "&":
        if (this.peekNext() === "&") {
          this.index += 2;
          return { type: "ANDAND", text: "&&" };
        }
        throw new Error("Unexpected character: &");
      case "|":
        if (this.peekNext() === "|") {
          this.index += 2;
          return { type: "OROR", text: "||" };
        }
        throw new Error("Unexpected character: |");
      default:
        if (isNumberStart(c)) {
          return this.number();
        }
        if (isIdentifierStart(c)) {
          return this.identifier();
        }
        throw new Error(`Unexpected character: ${c}`);
    }
  }

  private skipWhitespace(): void {
    while (this.index < this.source.length && /\s/.test(this.source[this.index] ?? "")) {
      this.index += 1;
    }
  }

  private single(type: TokenType): Token {
    const text = this.source[this.index] ?? "";
    this.index += 1;
    return { type, text };
  }

  private number(): Token {
    const start = this.index;
    while (this.index < this.source.length) {
      const c = this.source[this.index] ?? "";
      if (/[0-9.]/.test(c)) {
        this.index += 1;
      } else {
        break;
      }
    }
    return { type: "NUMBER", text: this.source.slice(start, this.index) };
  }

  private identifier(): Token {
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
      return { type: "IF", text };
    }
    if (text === "else") {
      return { type: "ELSE", text };
    }
    return { type: "IDENTIFIER", text };
  }

  private match(expectedNext: string, matched: TokenType, single: TokenType): Token {
    if (this.peekNext() === expectedNext) {
      this.index += 2;
      return { type: matched, text: this.source.slice(this.index - 2, this.index) };
    }
    this.index += 1;
    return { type: single, text: this.source.slice(this.index - 1, this.index) };
  }

  private peekNext(): string {
    return this.source[this.index + 1] ?? "\0";
  }
}

class Parser {
  private current: Token;

  constructor(source: string) {
    const lexer = new Lexer(source);
    this.lexer = lexer;
    this.current = lexer.nextToken();
  }

  private readonly lexer: Lexer;

  parseTopLevelExpression(): Expr {
    if (this.peekType() === "IF") {
      return this.parseIfExpression();
    }
    return this.parseLogicalOr();
  }

  expect(expected: TokenType): Token {
    if (this.current.type !== expected) {
      throw new Error(`Expected ${expected} but found ${this.current.type}`);
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

    throw new Error(`Unexpected token: ${this.current.text}`);
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
        const argument = this.parseTopLevelExpression();
        this.expect("RPAREN");
        return { type: "Integral", expr: argument };
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
  const parser = new Parser(normalize(source));
  const expression = parser.parseTopLevelExpression();
  parser.expect("EOF");
  return expression;
}

export function parseEquation(name: string, source: string): ParsedEquation {
  const sourceExpression = parseExpression(source);
  const expression = lowerIntegrals(name, sourceExpression);
  return {
    name,
    expression,
    sourceExpression,
    currentDependencies: Array.from(collectCurrentDependencies(expression)),
    lagDependencies: Array.from(collectLagDependencies(expression))
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
    case "Number":
    case "Variable":
    case "Lag":
    case "Diff":
      return false;
  }
}

function normalize(source: string): string {
  return source.replace(LAG_PATTERN, "lag($1)").replace(DIFF_PATTERN, "diff($1)");
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
