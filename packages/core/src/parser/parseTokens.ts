export type TokenType =
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

export interface Token {
  type: TokenType;
  text: string;
  offset: number;
}
