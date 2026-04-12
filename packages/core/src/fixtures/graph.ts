import type { EquationDef } from "../model/types";

export const graphOrderingFixture: EquationDef[] = [
  { name: "a", expression: "1" },
  { name: "b", expression: "a + 1" },
  { name: "c", expression: "d + 1" },
  { name: "d", expression: "c + 1" },
  { name: "e", expression: "b + c" }
];
