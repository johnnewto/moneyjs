import { describe, expect, it } from "vitest";

import {
  compareSectionBoundaries,
  formatSectionCommentText,
  inferEquationSectionBoundaries,
  notebookFromYaml,
  parseSectionBoundarySignature,
  parseSectionCommentText,
  resolveInferredSectionBoundary,
  splitEquationListIntoSections,
  validateSectionCommentText
} from "@sfcr/notebook-core";

import { NOTEBOOK_TEMPLATES } from "../src/notebook/templates";

describe("section boundary signatures", () => {
  it("parses title and boundary from section comment text", () => {
    expect(
      parseSectionCommentText("Production Firms | Y, WBd, Ld, Id = Production_Firms (Cs, Is)")
    ).toEqual({
      title: "Production Firms",
      boundary: {
        functionName: "Production_Firms",
        inputs: ["Cs", "Is"],
        outputs: ["Id", "Ld", "WBd", "Y"]
      }
    });
  });

  it("keeps title-only comments backward compatible", () => {
    expect(parseSectionCommentText("Supply block")).toEqual({
      title: "Supply block",
      boundary: null
    });
  });

  it("formats section comment text with boundary signature", () => {
    expect(
      formatSectionCommentText("Production Firms", {
        functionName: "Production_Firms",
        inputs: ["Cs", "Is"],
        outputs: ["Y", "WBd", "Ld", "Id"]
      })
    ).toBe("Production Firms | Id, Ld, WBd, Y = Production_Firms (Cs, Is)");
  });

  it("validates section titles and rejects stored boundary signatures", () => {
    expect(validateSectionCommentText("Production Firms")).toBeNull();
    expect(validateSectionCommentText("Production Firms | Y = Production_Firms (Cs)")).toMatch(
      /generated automatically/i
    );
    expect(validateSectionCommentText("| Y = Section (X)")).toMatch(/title is required/i);
  });

  it("parses standalone boundary signatures", () => {
    expect(parseSectionBoundarySignature("Y, WBd = Production_Firms (Cs, Is)")).toEqual({
      functionName: "Production_Firms",
      inputs: ["Cs", "Is"],
      outputs: ["WBd", "Y"]
    });
  });

  it("infers BMW production firms boundary from equations", () => {
    const source = `
format: sfcr-notebook-yaml
formatVersion: 1
id: bmw-boundary-notebook
title: BMW boundary inference
metadata:
  version: 1
cells:
  - equations:
      id: equations-main
      title: BMW model
      modelId: main
      rows:
        - "Equalize supply to demand."
        - [Cs, Cd, "Consumption goods supply", $/year, flow, definition]
        - [Is, Id, "Supply of investment goods", $/year, flow, definition]
        - [Ns, Nd, "Supply of labor", items/year, flow, definition]
        - Production Firms
        - [Y, Cs + Is, "Income = GDP", $/year, flow, identity]
        - [WBd, Y - lag(rl) * lag(Ld) - AF, "Wage bill - demand", $/year, flow, identity]
        - [AF, delta * lag(K), "Amortization funds", $/year, flow, definition]
        - [DA, delta * lag(K), "Depreciation allowance", $/year, flow, definition]
        - [Ld, lag(Ld) + (Id - AF) * dt, "Demand for bank loans", $, stock, accumulation]
        - [KT, kappa * lag(Y), "Target stock of capital", $, stock, target]
        - [K, K' + (Id - DA) * dt, "Stock of capital", $, stock, accumulation]
        - [Id, gamma * (KT - lag(K)) + DA, "Demand for investment goods", $/year, flow, behavioral]
        - [Mf, Mf' + sum(Firms.Deposits) * dt, "Stock accumulation from Firms.Deposits (Mf)", $, stock, accumulation]
        - Wage bill
        - [WBs, W * Ns, "Wage bill - supply", $/year, flow, identity]
        - [Nd, Y / pr, "Demand for labor", items/year, flow, definition]
        - [W, WBd / Nd, "Wage rate", $/item, aux, definition]
        - Households.
        - [YD, WBs + lag(rm) * lag(Mh), "Disposable income of households", $/year, flow, identity]
        - [Cd, alpha0 + alpha1 * YD + alpha2 * lag(Mh), "Consumption goods demand by households", $/year, flow, behavioral]
        - [Mh, Mh' + sum(Households.Deposits) * dt, "Stock accumulation from Households.Deposits (Mh)", $, stock, accumulation]
        - [Vh, Vh' + sum(Households.Net_Worth) * dt, "Stock accumulation from Households.Net_Worth (Vh)", $, stock, accumulation]
        - Banks
        - [rm, rl, "Rate of interest on bank deposits", 1/year, aux, definition]
        - [Ls, lag(Ls) + d(Ld) * dt, "Supply of bank loans", $, stock, accumulation]
        - [Ms, lag(Ms) + d(Ls) * dt, "Supply of bank deposits", $, stock, accumulation]
  - externals:
      id: externals-main
      title: Externals
      modelId: main
      rows:
        - [rl, 0.025, "Rate of interest on bank loans", 1/year, aux]
        - [alpha0, 20, "Exogenous component in consumption", $/year, aux]
        - [alpha1, 0.75, "Propensity to consume out of income", "", aux]
        - [alpha2, 0.1, "Propensity to consume out of wealth", 1/year, aux]
        - [delta, 0.1, "Depreciation rate", 1/year, aux]
        - [gamma, 0.15, "Speed of adjustment of capital to its target value", 1/year, aux]
        - [kappa, 1, "Capital-output ratio", year, aux]
        - [pr, 1, "Labor productivity", $/item, aux]
  - solver:
      id: solver-main
      title: Solver
      modelId: main
      tolerance: "1e-10"
      maxIterations: 100
      defaultInitialValue: "1e-15"
  - run:
      id: baseline-run
      title: Baseline
      mode: baseline
      periods: 10
      resultKey: baseline
      sourceModelId: main
`.trim();

    const document = notebookFromYaml(source);
    const equationsCell = document.cells.find((cell) => cell.type === "equations");
    const externalsCell = document.cells.find((cell) => cell.type === "externals");
    expect(equationsCell?.type).toBe("equations");
    if (equationsCell?.type !== "equations" || externalsCell?.type !== "externals") {
      return;
    }

    const sections = splitEquationListIntoSections(equationsCell.equations);
    const productionFirms = sections.find((section) => section.title === "Production Firms");
    expect(productionFirms).toBeDefined();
    if (!productionFirms) {
      return;
    }

    const inferred = inferEquationSectionBoundaries({
      equations: equationsCell.equations,
      externals: externalsCell.externals
    });
    const productionBoundary = inferred.get(productionFirms.comment.id);
    expect(productionBoundary).toEqual({
      functionName: "Production_Firms",
      inputs: ["Cs", "Is"],
      outputs: ["Id", "Ld", "WBd", "Y"]
    });

    expect(
      compareSectionBoundaries(
        {
          functionName: "Production_Firms",
          inputs: ["Cs", "Is"],
          outputs: ["Y", "WBd", "Ld", "Id"]
        },
        productionBoundary!
      )
    ).toEqual([]);
  });

  it("infers BMW template section boundaries at display time", () => {
    const equationsCell = NOTEBOOK_TEMPLATES.bmw.document.cells.find((cell) => cell.type === "equations");
    const externalsCell = NOTEBOOK_TEMPLATES.bmw.document.cells.find((cell) => cell.type === "externals");
    expect(equationsCell?.type).toBe("equations");
    if (equationsCell?.type !== "equations" || externalsCell?.type !== "externals") {
      return;
    }

    const productionComment = equationsCell.equations.find(
      (row): row is Extract<(typeof equationsCell.equations)[number], { kind: "comment" }> =>
        row.kind === "comment" && row.text === "Production Firms"
    );
    expect(productionComment).toBeDefined();
    if (!productionComment) {
      return;
    }

    // BMW keeps [Is, Id, ...] inside Production Firms (after the section comment),
    // so Is is defined in-section and Id is only consumed within the same section.
    expect(
      resolveInferredSectionBoundary({
        comment: productionComment,
        equations: equationsCell.equations,
        externals: externalsCell.externals
      })
    ).toEqual({
      functionName: "Production_Firms",
      inputs: ["Cs"],
      outputs: ["Ld", "WBd", "Y"]
    });
  });

  it("infers a boundary for a title-only section comment", () => {
    const source = `
format: sfcr-notebook-yaml
formatVersion: 1
id: bmw-boundary-notebook
title: BMW boundary round trip
metadata:
  version: 1
cells:
  - equations:
      id: equations-main
      title: BMW model
      modelId: main
      rows:
        - Equalize supply to demand.
        - [Cs, Cd, "Consumption goods supply", $/year, flow, definition]
        - [Is, Id, "Supply of investment goods", $/year, flow, definition]
        - Production Firms
        - [Y, Cs + Is, "Income = GDP", $/year, flow, identity]
        - [Id, 1, "Demand for investment goods", $/year, flow, behavioral]
        - Households.
        - [Cd, 1, "Consumption goods demand", $/year, flow, behavioral]
  - solver:
      id: solver-main
      title: Solver
      modelId: main
      tolerance: "1e-10"
      maxIterations: 100
      defaultInitialValue: "1e-15"
  - run:
      id: baseline-run
      title: Baseline
      mode: baseline
      periods: 10
      resultKey: baseline
      sourceModelId: main
`.trim();

    const document = notebookFromYaml(source);
    const equationsCell = document.cells.find((cell) => cell.type === "equations");
    expect(equationsCell?.type).toBe("equations");
    if (equationsCell?.type !== "equations") {
      return;
    }

    const productionComment = equationsCell.equations.find(
      (row) => row.kind === "comment" && row.text === "Production Firms"
    );
    expect(productionComment).toMatchObject({
      kind: "comment",
      text: "Production Firms"
    });
    if (productionComment?.kind !== "comment") {
      return;
    }

    const boundaries = inferEquationSectionBoundaries({
      equations: equationsCell.equations
    });
    expect(boundaries.get(productionComment.id)).toEqual({
      functionName: "Production_Firms",
      inputs: ["Cs", "Is"],
      outputs: ["Id"]
    });
  });
});
