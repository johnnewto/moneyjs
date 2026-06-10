import { describe, expect, it } from "vitest";

import {
  applyMirroredEquationUnitSuggestions,
  buildVariableUnitMetadata,
  diagnoseEquationUnits,
  formatUnitTextForVariableName,
  getEquationRowUnitLabel,
  getVariableUnitLabel,
  suggestEquationUnitMeta,
  suggestMirroredAdditiveUnitMeta
} from "../src/lib/units";
import { formatUnitText } from "../src/lib/unitMeta";
import { parseEquation } from "@sfcr/core";

describe("derivative-balance unit checking", () => {
  const variableUnitMetadata = buildVariableUnitMetadata({
    equations: [
      {
        id: "eq-ls",
        name: "d(Ls)",
        expression: "d(Ld)",
        unitMeta: { stockFlow: "stock", signature: { money: 1 } }
      },
      {
        id: "eq-ld",
        name: "Ld",
        expression: "1",
        unitMeta: { stockFlow: "stock", signature: { money: 1 } }
      }
    ]
  });

  it("validates d(stock) = flowExpr like I(flowExpr)", () => {
    const parsed = parseEquation("d(Ls)", "d(Ld)");
    expect(parsed.sourceExpression.type).toBe("Integral");

    const diagnostics = diagnoseEquationUnits(
      "d(Ls)",
      parsed.sourceExpression,
      variableUnitMetadata
    );

    expect(diagnostics).toEqual([]);
  });

  it("suggests stock units for derivative-balance equation rows", () => {
    expect(
      suggestEquationUnitMeta({
        variableName: "d(Ls)",
        expression: "d(Ld)",
        variableUnitMetadata
      })
    ).toEqual({
      stockFlow: "stock",
      signature: { money: 1 }
    });
  });

  it("displays derivative-balance names as flow units while stocks stay level units", () => {
    const stockMeta = { stockFlow: "stock" as const, signature: { money: 1 } };

    expect(getEquationRowUnitLabel("d(Ls)", stockMeta)).toBe("$/yr");
    expect(getVariableUnitLabel(variableUnitMetadata, "d(Ls)")).toBe("$/yr");
    expect(getVariableUnitLabel(variableUnitMetadata, "Ls")).toBe("$");
    expect(formatUnitText(stockMeta)).toBe("$");
    expect(formatUnitTextForVariableName("d(Ls)", stockMeta)).toBe("$/yr");
  });

  it("derives stock units from the RHS flow when the stock is not yet tagged", () => {
    const metadata = buildVariableUnitMetadata({
      equations: [
        {
          id: "eq-ld",
          name: "Ld",
          expression: "1",
          unitMeta: { stockFlow: "stock", signature: { money: 1 } }
        }
      ]
    });

    expect(
      suggestEquationUnitMeta({
        variableName: "d(Ls)",
        expression: "d(Ld)",
        variableUnitMetadata: metadata
      })
    ).toEqual({
      stockFlow: "stock",
      signature: { money: 1 }
    });
  });
});

describe("mirrored additive unit suggestions", () => {
  const flowMeta = { stockFlow: "flow" as const, signature: { money: 1, time: -1 } };
  const stockMeta = { stockFlow: "stock" as const, signature: { money: 1 } };

  it("mirrors agreeing flow operands onto an identity sum", () => {
    const variableUnitMetadata = buildVariableUnitMetadata({
      equations: [
        { id: "eq-c", name: "C", expression: "1", unitMeta: flowMeta },
        { id: "eq-i", name: "I", expression: "1", unitMeta: flowMeta }
      ]
    });

    expect(
      suggestMirroredAdditiveUnitMeta({
        variableName: "Y",
        expression: "C + I",
        variableUnitMetadata
      })
    ).toEqual(flowMeta);
  });

  it("mirrors a single-variable identity", () => {
    const variableUnitMetadata = buildVariableUnitMetadata({
      equations: [{ id: "eq-cd", name: "Cd", expression: "1", unitMeta: flowMeta }]
    });

    expect(
      suggestMirroredAdditiveUnitMeta({
        variableName: "Cs",
        expression: "Cd",
        variableUnitMetadata
      })
    ).toEqual(flowMeta);
  });

  it("returns null when tagged operands disagree on kind", () => {
    const variableUnitMetadata = buildVariableUnitMetadata({
      equations: [
        { id: "eq-c", name: "C", expression: "1", unitMeta: flowMeta },
        {
          id: "eq-k",
          name: "K",
          expression: "1",
          unitMeta: { stockFlow: "stock" as const, signature: { money: 1, time: -1 } }
        }
      ]
    });

    expect(
      suggestMirroredAdditiveUnitMeta({
        variableName: "Y",
        expression: "C + K",
        variableUnitMetadata
      })
    ).toBeNull();
  });

  it("returns null when tagged operands disagree", () => {
    const variableUnitMetadata = buildVariableUnitMetadata({
      equations: [
        { id: "eq-c", name: "C", expression: "1", unitMeta: flowMeta },
        { id: "eq-k", name: "K", expression: "1", unitMeta: stockMeta }
      ]
    });

    expect(
      suggestMirroredAdditiveUnitMeta({
        variableName: "Y",
        expression: "C + K",
        variableUnitMetadata
      })
    ).toBeNull();
  });

  it("skips accumulation equations even when structurally additive", () => {
    const variableUnitMetadata = buildVariableUnitMetadata({
      equations: [
        {
          id: "eq-mh",
          name: "Mh",
          expression: "lag(Mh) + YD - Cd",
          unitMeta: stockMeta
        },
        { id: "eq-yd", name: "YD", expression: "1", unitMeta: flowMeta },
        { id: "eq-cd", name: "Cd", expression: "1", unitMeta: flowMeta }
      ]
    });

    expect(
      suggestMirroredAdditiveUnitMeta({
        variableName: "Mh",
        expression: "lag(Mh) + YD - Cd",
        variableUnitMetadata
      })
    ).toBeNull();
  });

  it("applies mirrored suggestions only where metadata differs", () => {
    const variableUnitMetadata = buildVariableUnitMetadata({
      equations: [
        { id: "eq-c", name: "C", expression: "1", unitMeta: flowMeta },
        { id: "eq-i", name: "I", expression: "1", unitMeta: flowMeta },
        { id: "eq-y", name: "Y", expression: "C + I" },
        { id: "eq-cs", name: "Cs", expression: "Cd", unitMeta: flowMeta },
        { id: "eq-cd", name: "Cd", expression: "1", unitMeta: flowMeta }
      ]
    });

    expect(
      applyMirroredEquationUnitSuggestions({
        equations: [
          { id: "eq-c", name: "C", expression: "1", unitMeta: flowMeta },
          { id: "eq-i", name: "I", expression: "1", unitMeta: flowMeta },
          { id: "eq-y", name: "Y", expression: "C + I" },
          { id: "eq-cs", name: "Cs", expression: "Cd", unitMeta: flowMeta },
          { id: "eq-cd", name: "Cd", expression: "1", unitMeta: flowMeta }
        ],
        variableUnitMetadata
      }).equations
    ).toEqual([
      { id: "eq-c", name: "C", expression: "1", unitMeta: flowMeta },
      { id: "eq-i", name: "I", expression: "1", unitMeta: flowMeta },
      { id: "eq-y", name: "Y", expression: "C + I", unitMeta: flowMeta },
      { id: "eq-cs", name: "Cs", expression: "Cd", unitMeta: flowMeta },
      { id: "eq-cd", name: "Cd", expression: "1", unitMeta: flowMeta }
    ]);
  });

  it("propagates mirrored units through chained additive identities in one apply", () => {
    const flowMeta = { stockFlow: "flow" as const, signature: { money: 1, time: -1 } };
    const variableUnitMetadata = buildVariableUnitMetadata({
      equations: [
        { id: "eq-c", name: "C", expression: "1", unitMeta: flowMeta },
        { id: "eq-i", name: "I", expression: "1", unitMeta: flowMeta },
        { id: "eq-g", name: "G", expression: "1", unitMeta: flowMeta },
        { id: "eq-y", name: "Y", expression: "C + I" },
        { id: "eq-z", name: "Z", expression: "Y + G" }
      ]
    });

    expect(
      applyMirroredEquationUnitSuggestions({
        equations: [
          { id: "eq-c", name: "C", expression: "1", unitMeta: flowMeta },
          { id: "eq-i", name: "I", expression: "1", unitMeta: flowMeta },
          { id: "eq-g", name: "G", expression: "1", unitMeta: flowMeta },
          { id: "eq-y", name: "Y", expression: "C + I" },
          { id: "eq-z", name: "Z", expression: "Y + G" }
        ],
        variableUnitMetadata
      }).equations
    ).toEqual([
      { id: "eq-c", name: "C", expression: "1", unitMeta: flowMeta },
      { id: "eq-i", name: "I", expression: "1", unitMeta: flowMeta },
      { id: "eq-g", name: "G", expression: "1", unitMeta: flowMeta },
      { id: "eq-y", name: "Y", expression: "C + I", unitMeta: flowMeta },
      { id: "eq-z", name: "Z", expression: "Y + G", unitMeta: flowMeta }
    ]);
  });

  it("mirrors from a signature-only tagged operand when kind is omitted", () => {
    const itemsSignatureOnly = { signature: { items: 1, time: -1 } };

    expect(
      suggestMirroredAdditiveUnitMeta({
        variableName: "s",
        expression: "c + g + i",
        variableUnitMetadata: buildVariableUnitMetadata({
          equations: [{ id: "eq-i", name: "i", expression: "1", unitMeta: itemsSignatureOnly }]
        })
      })
    ).toEqual(itemsSignatureOnly);
  });

  it("tags untagged additive operands on the same RHS", () => {
    const itemsFlowMeta = { stockFlow: "flow" as const, signature: { items: 1, time: -1 } };
    const itemsSignatureOnly = { signature: { items: 1, time: -1 } };
    const equations = [
      { id: "eq-i", name: "i", expression: "(k - k[-1]) + delta * k[-1]", unitMeta: itemsSignatureOnly },
      { id: "eq-c", name: "c", expression: "alpha1 * (ydr^e + nl) + alpha2 * v[-1]" },
      { id: "eq-g", name: "g", expression: "g[-1] * (1 + GRg)" },
      { id: "eq-s", name: "s", expression: "c + g + i" }
    ];
    const variableUnitMetadata = buildVariableUnitMetadata({ equations });
    const result = applyMirroredEquationUnitSuggestions({ equations, variableUnitMetadata });

    expect(result.equations).toEqual([
      { id: "eq-i", name: "i", expression: "(k - k[-1]) + delta * k[-1]", unitMeta: itemsSignatureOnly },
      { id: "eq-c", name: "c", expression: "alpha1 * (ydr^e + nl) + alpha2 * v[-1]", unitMeta: itemsSignatureOnly },
      { id: "eq-g", name: "g", expression: "g[-1] * (1 + GRg)", unitMeta: itemsSignatureOnly },
      { id: "eq-s", name: "s", expression: "c + g + i", unitMeta: itemsSignatureOnly }
    ]);

    expect(result.changes).toEqual([
      {
        variable: "c",
        expression: "s = c + g + i",
        previous: undefined,
        proposed: itemsSignatureOnly
      },
      {
        variable: "g",
        expression: "s = c + g + i",
        previous: undefined,
        proposed: itemsSignatureOnly
      },
      {
        variable: "s",
        expression: "c + g + i",
        previous: undefined,
        proposed: itemsSignatureOnly
      }
    ]);
  });

  it("includes kind when at least one tagged operand has stockFlow", () => {
    const itemsFlowMeta = { stockFlow: "flow" as const, signature: { items: 1, time: -1 } };
    const itemsSignatureOnly = { signature: { items: 1, time: -1 } };

    expect(
      suggestMirroredAdditiveUnitMeta({
        variableName: "s",
        expression: "c + i",
        variableUnitMetadata: buildVariableUnitMetadata({
          equations: [
            { id: "eq-c", name: "c", expression: "1", unitMeta: itemsSignatureOnly },
            { id: "eq-i", name: "i", expression: "1", unitMeta: itemsFlowMeta }
          ]
        })
      })
    ).toEqual(itemsFlowMeta);
  });

  it("returns a change summary alongside updated equations", () => {
    const flowMeta = { stockFlow: "flow" as const, signature: { money: 1, time: -1 } };
    const variableUnitMetadata = buildVariableUnitMetadata({
      equations: [
        { id: "eq-c", name: "C", expression: "1", unitMeta: flowMeta },
        { id: "eq-i", name: "I", expression: "1", unitMeta: flowMeta },
        { id: "eq-y", name: "Y", expression: "C + I" }
      ]
    });

    expect(
      applyMirroredEquationUnitSuggestions({
        equations: [
          { id: "eq-c", name: "C", expression: "1", unitMeta: flowMeta },
          { id: "eq-i", name: "I", expression: "1", unitMeta: flowMeta },
          { id: "eq-y", name: "Y", expression: "C + I" }
        ],
        variableUnitMetadata
      }).changes
    ).toEqual([
      {
        variable: "Y",
        expression: "C + I",
        previous: undefined,
        proposed: flowMeta
      }
    ]);
  });
});

describe("additive unit compatibility", () => {
  const inverseTimeMeta = { stockFlow: "aux" as const, signature: { time: -1 } };
  const flowMoneyMeta = { stockFlow: "flow" as const, signature: { money: 1, time: -1 } };

  function diagnoseExpression(variableName: string, expression: string, metadata = buildVariableUnitMetadata({})) {
    const parsed = parseEquation(variableName, expression);
    return diagnoseEquationUnits(variableName, parsed.sourceExpression, metadata);
  }

  it("allows dimensionless constants with pure inverse-time rates in growth factors", () => {
    const metadata = buildVariableUnitMetadata({
      externals: [{ id: "ext-grpr", name: "GRpr", kind: "constant", valueText: "0.03", unitMeta: inverseTimeMeta }]
    });

    expect(diagnoseExpression("PR", "PR[-1] * (1 + GRpr)", metadata)).toEqual([]);
  });

  it("allows mixing inverse-time rates with dimensionless parameters in sums", () => {
    const metadata = buildVariableUnitMetadata({
      externals: [
        { id: "ext-grpr", name: "GRpr", kind: "constant", valueText: "0.03", unitMeta: inverseTimeMeta },
        { id: "ext-ra", name: "RA", kind: "constant", valueText: "0" }
      ]
    });

    expect(diagnoseExpression("s^e", "1 + (GRpr + RA)", metadata)).toEqual([]);
  });

  it("still rejects combining dimensionless values with money flows", () => {
    const metadata = buildVariableUnitMetadata({
      equations: [{ id: "eq-c", name: "C", expression: "1", unitMeta: flowMoneyMeta }]
    });

    const diagnostics = diagnoseExpression("Y", "1 + C", metadata);
    expect(diagnostics).toEqual([
      {
        severity: "warning",
        message: "Cannot combine 1 with $/yr using '+'."
      }
    ]);
  });

  it("still rejects combining dimensionless values with mixed-dimension inverse-time rates", () => {
    const metadata = buildVariableUnitMetadata({
      externals: [{ id: "ext-rl", name: "rl", kind: "constant", valueText: "0.05", unitMeta: flowMoneyMeta }]
    });

    const diagnostics = diagnoseExpression("x", "1 + rl", metadata);
    expect(diagnostics).toEqual([
      {
        severity: "warning",
        message: "Cannot combine 1 with $/yr using '+'."
      }
    ]);
  });
});
