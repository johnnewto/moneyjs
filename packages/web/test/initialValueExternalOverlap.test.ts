import { describe, expect, it } from "vitest";

import {
  buildInitialValueExternalOverlapSummary,
  formatInitialValueExternalOverlapRemovalMessage,
  removeInitialValuesOverlappingExternals
} from "../src/lib/initialValueExternalOverlap";

describe("initialValueExternalOverlap", () => {
  it("finds initial value rows whose names match externals", () => {
    const summary = buildInitialValueExternalOverlapSummary(
      [
        { id: "init-y", name: "Y", valueText: "100" },
        { id: "init-c", name: "C", valueText: "80" },
        { id: "init-g", name: "G", valueText: "20", enabled: false }
      ],
      [
        { id: "ext-y", name: "Y", kind: "constant", valueText: "0" },
        { id: "ext-alpha", name: "alpha1", kind: "constant", valueText: "0.8" }
      ]
    );

    expect(summary.overlaps).toEqual([
      {
        name: "Y",
        externalKind: "constant",
        initialValueText: "100",
        initialValueEnabled: true
      }
    ]);
  });

  it("removes overlapping rows while keeping comments and unrelated rows", () => {
    const next = removeInitialValuesOverlappingExternals(
      [
        { id: "comment-1", kind: "comment", text: "Parameters" },
        { id: "init-y", name: "Y", valueText: "100" },
        { id: "init-h", name: "H", valueText: "50" }
      ],
      [{ id: "ext-y", name: "Y", kind: "series", valueText: "1,2,3" }]
    );

    expect(next).toEqual([
      { id: "comment-1", kind: "comment", text: "Parameters" },
      { id: "init-h", name: "H", valueText: "50" }
    ]);
  });

  it("formats a removal summary message", () => {
    expect(
      formatInitialValueExternalOverlapRemovalMessage({
        overlaps: [{ name: "Y", externalKind: "constant", initialValueText: "100", initialValueEnabled: true }]
      })
    ).toBe("Removed 1 initial value row that overlapped externals: Y.");
  });
});
