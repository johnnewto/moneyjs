export type Expr =
  | NumberExpr
  | VariableExpr
  | LagExpr
  | DiffExpr
  | IntegralExpr
  | UnaryExpr
  | BinaryExpr
  | IfExpr
  | FunctionExpr;

export interface NumberExpr {
  type: "Number";
  value: number;
}

export interface VariableExpr {
  type: "Variable";
  name: string;
}

export interface LagExpr {
  type: "Lag";
  name: string;
}

export interface DiffExpr {
  type: "Diff";
  name: string;
}

export interface IntegralExpr {
  type: "Integral";
  expr: Expr;
}

export interface UnaryExpr {
  type: "Unary";
  op: "-";
  expr: Expr;
}

export interface BinaryExpr {
  type: "Binary";
  op: "+" | "-" | "*" | "/" | "^" | ">" | ">=" | "<" | "<=" | "==" | "!=" | "&&" | "||";
  left: Expr;
  right: Expr;
}

export interface IfExpr {
  type: "If";
  condition: Expr;
  whenTrue: Expr;
  whenFalse: Expr;
}

export interface FunctionExpr {
  type: "Function";
  name: "exp" | "log" | "abs" | "sqrt" | "min" | "max";
  args: Expr[];
}
