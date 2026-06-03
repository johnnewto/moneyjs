import type { Expr } from "../parser/ast";
import { parseEquation, parseExpression } from "../parser/parse";
import type { MatrixColumnSumBindings } from "../parser/dependencies";
import type { Link, LinkPolarity } from "./types";
import { normalizeCldEquationSource } from "./normalize";

type Sign = 1 | -1;

interface SignedRef {
  variable: string;
  sign: Sign;
  lagged: boolean;
}

export interface InferLinksOptions {
  matrixColumnSums?: MatrixColumnSumBindings;
}

/**
 * Infer signed causal links from equation RHS expressions.
 *
 * v1: additive/multiplicative structure only; skips if/comparisons/logical ops,
 * matrix column sums, and integral outer forms.
 */
export function inferLinksFromEquations(
  equations: Record<string, string>,
  endogenous: Set<string>,
  options: InferLinksOptions = {}
): { links: Link[]; errors: string[] } {
  const errors: string[] = [];
  const linkMap = new Map<string, Link>();
  const matrixColumnSums = options.matrixColumnSums;

  for (const [rawTarget, rawSource] of Object.entries(equations)) {
    const target = rawTarget.trim();
    const source = normalizeCldEquationSource(rawSource.trim());
    if (!target || !source) {
      continue;
    }

    let parsed;
    try {
      parsed = parseEquation(target, source, { matrixColumnSums });
    } catch (error) {
      errors.push(
        `${target}: ${error instanceof Error ? error.message : "Unable to parse expression."}`
      );
      continue;
    }

    const refs = collectSignedEndogenousRefs(parsed.expression, 1, matrixColumnSums);
    for (const ref of refs) {
      if (!endogenous.has(ref.variable)) {
        continue;
      }
      // Stock accumulation (lag(X) on equation X) is the identity X_{t-1} → X_t.
      // Skip same-period self references only.
      if (ref.variable === target && !ref.lagged) {
        continue;
      }

      const polarity: LinkPolarity = ref.sign === 1 ? "+" : "-";
      const key = `${ref.variable}->${target}`;
      const existing = linkMap.get(key);
      if (
        existing &&
        (existing.polarity !== polarity || existing.lagged !== ref.lagged)
      ) {
        errors.push(`Conflicting link polarity for ${ref.variable} → ${target}.`);
        continue;
      }
      linkMap.set(key, { from: ref.variable, to: target, polarity, lagged: ref.lagged });
    }
  }

  const links = [...linkMap.values()].sort((left, right) => {
    const byFrom = left.from.localeCompare(right.from);
    if (byFrom !== 0) {
      return byFrom;
    }
    const byTo = left.to.localeCompare(right.to);
    if (byTo !== 0) {
      return byTo;
    }
    return left.polarity.localeCompare(right.polarity);
  });

  return { links, errors };
}

function flipSign(sign: Sign): Sign {
  return sign === 1 ? -1 : 1;
}

function stripLeadingPlus(source: string): string {
  return source.startsWith("+") ? source.slice(1).trimStart() : source;
}

function collectSignedEndogenousRefsFromMatrixCellSources(
  sources: string[],
  sign: Sign,
  matrixColumnSums?: MatrixColumnSumBindings
): SignedRef[] {
  const refs: SignedRef[] = [];
  for (const source of sources) {
    const trimmed = source.trim();
    if (!trimmed || trimmed === "0") {
      continue;
    }
    try {
      const expression = parseExpression(stripLeadingPlus(trimmed));
      refs.push(...collectSignedEndogenousRefs(expression, sign, matrixColumnSums));
    } catch {
      // Ignore invalid matrix cell sources during CLD link inference.
    }
  }
  return refs;
}

function collectSignedEndogenousRefs(
  expr: Expr,
  sign: Sign,
  matrixColumnSums?: MatrixColumnSumBindings
): SignedRef[] {
  switch (expr.type) {
    case "Number":
    case "Integral":
      return [];
    case "MatrixColumnSum": {
      const sources = matrixColumnSums?.[expr.columnRef.trim()] ?? [];
      return collectSignedEndogenousRefsFromMatrixCellSources(sources, sign, matrixColumnSums);
    }
    case "Variable":
      return [{ variable: expr.name, sign, lagged: false }];
    case "Lag":
    case "Diff":
      return [{ variable: expr.name, sign, lagged: true }];
    case "Unary":
      if (expr.op === "-") {
        return collectSignedEndogenousRefs(expr.expr, flipSign(sign), matrixColumnSums);
      }
      return [];
    case "Binary": {
      if (expr.op === "+" || expr.op === "-") {
        const leftRefs = collectSignedEndogenousRefs(expr.left, sign, matrixColumnSums);
        const rightSign = expr.op === "+" ? sign : flipSign(sign);
        return [
          ...leftRefs,
          ...collectSignedEndogenousRefs(expr.right, rightSign, matrixColumnSums)
        ];
      }
      if (expr.op === "*") {
        return [
          ...collectSignedEndogenousRefs(expr.left, sign, matrixColumnSums),
          ...collectSignedEndogenousRefs(expr.right, sign, matrixColumnSums)
        ];
      }
      if (expr.op === "/") {
        return [
          ...collectSignedEndogenousRefs(expr.left, sign, matrixColumnSums),
          ...collectSignedEndogenousRefs(expr.right, flipSign(sign), matrixColumnSums)
        ];
      }
      return [];
    }
    case "If":
    case "Function":
      return [];
  }
}
