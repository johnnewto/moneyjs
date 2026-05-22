import { describe, expect, it } from "vitest";

import {
  classifyMatrixEntrySource,
  matrixReferenceShapesMatch
} from "../src/notebook/matrixVariableReference";

describe("classifyMatrixEntrySource", () => {
  it("treats signed variable references as plain", () => {
    expect(classifyMatrixEntrySource("+Mh")).toEqual({
      shape: { kind: "plain", accountingPrefix: "+" },
      variableName: "Mh"
    });
    expect(classifyMatrixEntrySource("-Cs")).toEqual({
      shape: { kind: "plain", accountingPrefix: "-" },
      variableName: "Cs"
    });
    expect(classifyMatrixEntrySource("Cd")).toEqual({
      shape: { kind: "plain", accountingPrefix: "" },
      variableName: "Cd"
    });
  });

  it("treats one-function-one-variable forms with distinct shapes", () => {
    expect(classifyMatrixEntrySource("d(Ld)")).toEqual({
      shape: { kind: "diff" },
      variableName: "Ld"
    });
    expect(classifyMatrixEntrySource("lag(Mh)")).toEqual({
      shape: { kind: "lag" },
      variableName: "Mh"
    });
    expect(classifyMatrixEntrySource("Mh[-1]")).toEqual({
      shape: { kind: "lag" },
      variableName: "Mh"
    });
  });

  it("returns null for expressions and non-renameable values", () => {
    expect(classifyMatrixEntrySource("+rm[-1] * Mh[-1]")).toBeNull();
    expect(classifyMatrixEntrySource("alpha0 + alpha1 * YD")).toBeNull();
    expect(classifyMatrixEntrySource("0")).toBeNull();
    expect(classifyMatrixEntrySource("")).toBeNull();
  });
});

describe("matrixReferenceShapesMatch", () => {
  it("matches plain references only with the same accounting prefix", () => {
    const plusMh = classifyMatrixEntrySource("+Mh");
    const plusMh2 = classifyMatrixEntrySource("+Mh2");
    const minusMh = classifyMatrixEntrySource("-Mh");
    expect(plusMh).not.toBeNull();
    expect(plusMh2).not.toBeNull();
    expect(minusMh).not.toBeNull();
    if (!plusMh || !plusMh2 || !minusMh) {
      throw new Error("Expected classified matrix references.");
    }

    expect(matrixReferenceShapesMatch(plusMh, plusMh2)).toBe(true);
    expect(matrixReferenceShapesMatch(plusMh, minusMh)).toBe(false);
  });

  it("matches lag and diff references independently of the variable name", () => {
    const dLd = classifyMatrixEntrySource("d(Ld)");
    const dLd2 = classifyMatrixEntrySource("d(Ld2)");
    const lagMh = classifyMatrixEntrySource("lag(Mh)");
    expect(dLd).not.toBeNull();
    expect(dLd2).not.toBeNull();
    expect(lagMh).not.toBeNull();
    if (!dLd || !dLd2 || !lagMh) {
      throw new Error("Expected classified matrix references.");
    }

    expect(matrixReferenceShapesMatch(dLd, dLd2)).toBe(true);
    expect(matrixReferenceShapesMatch(dLd, lagMh)).toBe(false);
  });

  it("does not match across plain and diff shapes", () => {
    const newCr = classifyMatrixEntrySource("NewCr");
    const dCr = classifyMatrixEntrySource("d(Cr)");
    expect(newCr).not.toBeNull();
    expect(dCr).not.toBeNull();
    if (!newCr || !dCr) {
      throw new Error("Expected classified matrix references.");
    }

    expect(matrixReferenceShapesMatch(newCr, dCr)).toBe(false);
  });
});
