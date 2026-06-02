import type { Expr } from "../parser/ast";
import { parseEquation } from "../parser/parse";
import type { Link, LinkPolarity } from "./types";
import { normalizeCldEquationSource } from "./normalize";

type Sign = 1 | -1;

interface SignedRef {
  variable: string;
  sign: Sign;
  lagged: boolean;
}

/**
 * Infer signed causal links from equation RHS expressions.
 *
 * v1: additive/multiplicative structure only; skips if/comparisons/logical ops,
 * matrix column sums, and integral outer forms.
 */
export function inferLinksFromEquations(
  equations: Record<string, string>,
  endogenous: Set<string>
): { links: Link[]; errors: string[] } {
  const errors: string[] = [];
  const linkMap = new Map<string, Link>();

  for (const [rawTarget, rawSource] of Object.entries(equations)) {
    const target = rawTarget.trim();
    const source = normalizeCldEquationSource(rawSource.trim());
    if (!target || !source) {
      continue;
    }

    let parsed;
    try {
      parsed = parseEquation(target, source);
    } catch (error) {
      errors.push(
        `${target}: ${error instanceof Error ? error.message : "Unable to parse expression."}`
      );
      continue;
    }

    const refs = collectSignedEndogenousRefs(parsed.expression, 1);
    for (const ref of refs) {
      if (!endogenous.has(ref.variable)) {
        continue;
      }
      if (ref.variable === target) {
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

function collectSignedEndogenousRefs(expr: Expr, sign: Sign): SignedRef[] {
  switch (expr.type) {
    case "Number":
    case "MatrixColumnSum":
    case "Integral":
      return [];
    case "Variable":
      return [{ variable: expr.name, sign, lagged: false }];
    case "Lag":
    case "Diff":
      return [{ variable: expr.name, sign, lagged: true }];
    case "Unary":
      if (expr.op === "-") {
        return collectSignedEndogenousRefs(expr.expr, flipSign(sign));
      }
      return [];
    case "Binary": {
      if (expr.op === "+" || expr.op === "-") {
        const leftRefs = collectSignedEndogenousRefs(expr.left, sign);
        const rightSign = expr.op === "+" ? sign : flipSign(sign);
        return [...leftRefs, ...collectSignedEndogenousRefs(expr.right, rightSign)];
      }
      if (expr.op === "*") {
        return [
          ...collectSignedEndogenousRefs(expr.left, sign),
          ...collectSignedEndogenousRefs(expr.right, sign)
        ];
      }
      if (expr.op === "/") {
        return [
          ...collectSignedEndogenousRefs(expr.left, sign),
          ...collectSignedEndogenousRefs(expr.right, flipSign(sign))
        ];
      }
      return [];
    }
    case "If":
    case "Function":
      return [];
  }
}
