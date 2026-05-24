import { describe, expect, it } from "vitest";

import {
  buildVariableUnitMetadata,
  diagnoseEquationUnits,
  formatUnitTextForVariableName,
  getEquationRowUnitLabel,
  getVariableUnitLabel,
  suggestEquationUnitMeta
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
