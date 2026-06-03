import { describe, expect, it } from "vitest";

import { computeStabilityMetrics, runBaseline } from "@sfcr/core";

import {
  buildStabilityRawDataViews,
  buildStabilityRawHtmlDocument,
  buildStabilityRawJson,
  buildStabilityRawMarkdown,
  formatRawMatrixCell,
  matrixToMarkdownTable
} from "../src/lib/stabilityRawData";
import { buildStabilityDeltaPropagationView } from "../src/lib/stabilityDeltaPropagation";

describe("stabilityRawData formatting", () => {
  it("formats small and large matrix cells", () => {
    expect(formatRawMatrixCell(0)).toBe("0");
    expect(formatRawMatrixCell(0.8)).toBe("0.8000");
    expect(formatRawMatrixCell(1e-5)).toBe("1.000e-5");
  });

  it("builds markdown tables with row and column labels", () => {
    const markdown = matrixToMarkdownTable(
      "T",
      ["y"],
      [[0.8]]
    );

    expect(markdown).toContain("### T");
    expect(markdown).toContain("|  | y |");
    expect(markdown).toContain("| y | 0.8000 |");
  });

  it("exports raw views for a solved model", () => {
    const result = runBaseline(
      {
        equations: [{ name: "y", expression: "0.8 * lag(y) + 10" }],
        externals: {},
        initialValues: { y: 1 }
      },
      {
        periods: 4,
        solverMethod: "GAUSS_SEIDEL",
        tolerance: 1e-9,
        maxIterations: 20
      }
    );

    const analysis = computeStabilityMetrics(result, 2);
    const views = buildStabilityRawDataViews(analysis);

    expect(views.matrices).toHaveLength(4);
    expect(views.eigenmodes.length).toBeGreaterThan(0);
    expect(views.eigenmodes[0]?.rows[0]?.variable).toBe("y");

    const markdown = buildStabilityRawMarkdown(views);
    expect(markdown).toContain("T = −A₀⁻¹A₁");
    expect(markdown).toContain("Dominant mode");

    const json = buildStabilityRawJson(views, analysis);
    const parsed = JSON.parse(json) as { T: number[][]; variables: string[] };
    expect(parsed.variables).toEqual(["y"]);
    expect(parsed.T[0]?.[0]).toBeCloseTo(0.8, 4);

    const deltaPropagation = buildStabilityDeltaPropagationView(analysis, result, "lag-increment");
    const markdownWithDelta = buildStabilityRawMarkdown(views, deltaPropagation);
    expect(markdownWithDelta).toContain("Linear one-step response");
    expect(markdownWithDelta).toContain("Gain (linear)");
    expect(markdownWithDelta).toContain("Gain (path)");

    const html = buildStabilityRawHtmlDocument(views, analysis, 3, deltaPropagation);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("T = −A₀⁻¹A₁");
    expect(html).toContain("Dominant mode");
    expect(html).toContain("Δxₜ = T Δxₜ₋₁");
    expect(html).not.toContain("<script");
  });
});
