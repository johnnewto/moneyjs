import { describe, expect, it } from "vitest";

import { buildCldInputKey, fingerprintCldWorkerPayload } from "../src/notebook/cldInput";

describe("cldInput fingerprint", () => {
  it("is stable when unrelated notebook cells change", () => {
    const equationsCell = {
      type: "equations" as const,
      id: "eqs",
      title: "Model",
      metadata: { version: 1 },
      modelId: "m1",
      equations: [
        { id: "eq-a", name: "A", expression: "B" },
        { id: "eq-b", name: "B", expression: "lag(A)" }
      ]
    };
    const solverCell = {
      type: "solver" as const,
      id: "solver",
      title: "Solver",
      metadata: { version: 1 },
      modelId: "m1",
      options: {
        periods: 10,
        solverMethod: "NEWTON" as const,
        toleranceText: "1e-8",
        maxIterations: 25,
        defaultInitialValueText: "1e-15",
        hiddenLeftVariable: "",
        hiddenRightVariable: "",
        hiddenToleranceText: "0.00001",
        relativeHiddenTolerance: false
      },
      collapsed: true
    };
    const source = { kind: "cld" as const, modelId: "m1" };

    const keyA = buildCldInputKey([equationsCell, solverCell, { type: "markdown", id: "n1", title: "A", metadata: { version: 1 }, source: "one" }], source);
    const keyB = buildCldInputKey([equationsCell, solverCell, { type: "markdown", id: "n1", title: "A", metadata: { version: 1 }, source: "two" }], source);

    expect(keyA).toBe(keyB);
    expect(keyA.length).toBeGreaterThan(0);
  });

  it("changes when an equation expression changes", () => {
    const base = {
      type: "equations" as const,
      id: "eqs",
      title: "Model",
      metadata: { version: 1 },
      modelId: "m1",
      equations: [{ id: "eq-a", name: "A", expression: "1" }]
    };
    const solverCell = {
      type: "solver" as const,
      id: "solver",
      title: "Solver",
      metadata: { version: 1 },
      modelId: "m1",
      options: {
        periods: 10,
        solverMethod: "NEWTON" as const,
        toleranceText: "1e-8",
        maxIterations: 25,
        defaultInitialValueText: "1e-15",
        hiddenLeftVariable: "",
        hiddenRightVariable: "",
        hiddenToleranceText: "0.00001",
        relativeHiddenTolerance: false
      },
      collapsed: true
    };
    const source = { kind: "cld" as const, modelId: "m1" };

    const before = buildCldInputKey([base, solverCell], source);
    const after = buildCldInputKey(
      [
        {
          ...base,
          equations: [{ id: "eq-a", name: "A", expression: "2" }]
        },
        solverCell
      ],
      source
    );

    expect(before).not.toBe(after);
  });

  it("fingerprints matrix column-sum bindings", () => {
    const payloadA = {
      equations: { Y: "sum(Households.Deposits)" },
      matrixColumnSums: { "Households.Deposits": ["+A"] }
    };
    const payloadB = {
      equations: { Y: "sum(Households.Deposits)" },
      matrixColumnSums: { "Households.Deposits": ["+B"] }
    };

    expect(fingerprintCldWorkerPayload(payloadA)).not.toBe(fingerprintCldWorkerPayload(payloadB));
  });
});
