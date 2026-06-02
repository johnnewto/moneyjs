import type { EquationDef } from "../model/types";
import type { MatrixColumnSumBindings } from "../parser/dependencies";
import { inferLinksFromEquations } from "./inferLinks";
import { detectLoops, formatLoopSummary } from "./loops";
import { formatCldMermaid } from "./mermaid";
import type { CldNodeKind, CldResult } from "./types";

export function generateCld(
  equations: Record<string, string>,
  options?: { matrixColumnSums?: MatrixColumnSumBindings; nodeKinds?: Record<string, CldNodeKind | undefined> }
): CldResult {
  const trimmedEntries = Object.entries(equations)
    .map(([name, expression]) => [name.trim(), expression.trim()] as const)
    .filter(([name, expression]) => name.length > 0 && expression.length > 0);

  const endogenous = new Set(trimmedEntries.map(([name]) => name));
  const equationRecord = Object.fromEntries(trimmedEntries);
  const { links, errors } = inferLinksFromEquations(equationRecord, endogenous, {
    matrixColumnSums: options?.matrixColumnSums
  });
  const loops = detectLoops(links);

  return {
    links,
    mermaid: formatCldMermaid(links, { nodeKinds: options?.nodeKinds }),
    loops,
    loopSummary: formatLoopSummary(loops),
    errors
  };
}

export function generateCldFromEquations(equations: EquationDef[]): CldResult {
  const record = Object.fromEntries(
    equations
      .filter((equation) => equation.name.trim() && equation.expression.trim())
      .map((equation) => [equation.name.trim(), equation.expression.trim()])
  );
  return generateCld(record);
}
