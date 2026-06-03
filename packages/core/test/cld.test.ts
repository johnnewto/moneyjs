import { describe, expect, it } from "vitest";

import { generateCld, normalizeCldEquationSource } from "../src/cld";

const GODLEY_LAVOIE_EQUATIONS = {
  K: "lag(K) + I - AF",
  AF: "delta * lag(K)",
  Y: "lag(K) / kappa",
  P: "Y - WB - AF - rL * lag(L)",
  I: "gamma0 + gamma1 * P",
  L: "lag(L) + I - P"
};

const EXPECTED_LINKS = [
  { from: "AF", to: "K", polarity: "-", lagged: false },
  { from: "AF", to: "P", polarity: "-", lagged: false },
  { from: "I", to: "K", polarity: "+", lagged: false },
  { from: "I", to: "L", polarity: "+", lagged: false },
  { from: "K", to: "AF", polarity: "+", lagged: true },
  { from: "K", to: "K", polarity: "+", lagged: true },
  { from: "K", to: "Y", polarity: "+", lagged: true },
  { from: "L", to: "L", polarity: "+", lagged: true },
  { from: "L", to: "P", polarity: "-", lagged: true },
  { from: "P", to: "I", polarity: "+", lagged: false },
  { from: "P", to: "L", polarity: "-", lagged: false },
  { from: "Y", to: "P", polarity: "+", lagged: false }
] as const;

function loopBody(nodes: string[]): string[] {
  if (nodes.length > 1 && nodes[0] === nodes[nodes.length - 1]) {
    return nodes.slice(0, -1);
  }
  return nodes;
}

describe("generateCld", () => {
  it("infers signed links from a Godley–Lavoie-style model", () => {
    const result = generateCld(GODLEY_LAVOIE_EQUATIONS);

    expect(result.errors).toEqual([]);
    expect(result.links).toEqual([...EXPECTED_LINKS]);
  });

  it("includes lagged stock identity links (X_{t-1} → X_t)", () => {
    const result = generateCld({
      Mh: "lag(Mh) + YD - Cd",
      YD: "1",
      Cd: "1"
    });

    expect(result.errors).toEqual([]);
    expect(result.links).toContainEqual({
      from: "Mh",
      to: "Mh",
      polarity: "+",
      lagged: true
    });
  });

  it("infers stock identity from prime notation (Mh' + flows)", () => {
    const result = generateCld(
      {
        Mh: "Mh' + sum(Households.Deposits) * dt",
        WBd: "1",
        Cs: "1",
        Cd: "1"
      },
      {
        matrixColumnSums: {
          "Households.Deposits": ["WBd", "-Cs"]
        }
      }
    );

    expect(result.errors).toEqual([]);
    expect(result.links).toContainEqual({
      from: "Mh",
      to: "Mh",
      polarity: "+",
      lagged: true
    });
    expect(result.links).toContainEqual({ from: "WBd", to: "Mh", polarity: "+", lagged: false });
    expect(result.links).toContainEqual({ from: "Cs", to: "Mh", polarity: "-", lagged: false });
  });

  it("expands sum(column) links via matrixColumnSums bindings", () => {
    const equations = {
      A: "1",
      B: "1",
      C: "1",
      Y: "sum(col1)"
    };
    const result = generateCld(equations, {
      matrixColumnSums: {
        col1: ["+A", "-B", "0", "  + C  "]
      }
    });

    expect(result.errors).toEqual([]);
    expect(result.links).toEqual([
      { from: "A", to: "Y", polarity: "+", lagged: false },
      { from: "B", to: "Y", polarity: "-", lagged: false },
      { from: "C", to: "Y", polarity: "+", lagged: false }
    ]);
  });

  it("accepts pedagogical _lag suffixes via normalization", () => {
    const equations = {
      K: "K_lag + I - AF",
      AF: "delta * K_lag",
      Y: "K_lag / kappa",
      P: "Y - WB - AF - rL * L_lag",
      I: "gamma0 + gamma1 * P",
      L: "L_lag + I - P"
    };

    const result = generateCld(equations);
    expect(result.errors).toEqual([]);
    expect(result.links).toEqual([...EXPECTED_LINKS]);
  });

  it("emits mermaid flowchart edges", () => {
    const result = generateCld(GODLEY_LAVOIE_EQUATIONS);

    expect(result.mermaid).toContain("flowchart TD");
    expect(result.mermaid).toContain("I -->|+| K");
    expect(result.mermaid).toContain("AF -->|-| K");
    expect(result.mermaid).toContain("P -->|+| I");
  });

  it("truncates loop enumeration when maxLoops is exceeded", () => {
    const equations: Record<string, string> = {};
    for (let index = 1; index <= 8; index += 1) {
      const current = `V${index}`;
      const previous = index === 1 ? "V8" : `V${index - 1}`;
      equations[current] = `${previous} + V${index === 8 ? 1 : index + 1}`;
    }

    const uncapped = generateCld(equations, {
      loopDetection: { maxLoops: 10_000, maxLoopLength: 16, timeoutMs: 30_000 }
    });
    const capped = generateCld(equations, {
      loopDetection: { maxLoops: 5, maxLoopLength: 16, timeoutMs: 30_000 }
    });

    expect(uncapped.loops.length).toBeGreaterThan(5);
    expect(capped.loops).toHaveLength(5);
    expect(capped.loopDetection).toMatchObject({
      truncated: true,
      stopReason: "maxLoops",
      maxLoops: 5,
      timeoutMs: 30_000
    });
    expect(capped.loopDetection?.maxLoopLength).toBeLessThanOrEqual(16);
  });

  it("detects reinforcing and balancing loops", () => {
    const result = generateCld(GODLEY_LAVOIE_EQUATIONS);

    const findLoop = (expectedBody: string[]) =>
      result.loops.find((loop) => {
        const body = loopBody(loop.nodes);
        return (
          body.length === expectedBody.length &&
          body.every((node, index) => node === expectedBody[index])
        );
      });

    expect(findLoop(["I", "K", "Y", "P"])?.polarity).toBe("R");
    expect(findLoop(["AF", "K"])?.polarity).toBe("B");

    expect(result.loopSummary).toContain("R");
    expect(result.loopSummary).toContain("I +➙ K_-1 +⇢ Y +➙ P +➙ I");
    expect(result.loopSummary).toContain("AF -➙ K_-1 +⇢ AF");
  });
});

describe("normalizeCldEquationSource", () => {
  it("rewrites _lag identifiers to lag()", () => {
    expect(normalizeCldEquationSource("K_lag + I")).toBe("lag(K) + I");
  });
});
