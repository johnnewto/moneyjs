import { describe, expect, it } from "vitest";

import {
  documentMentionMatchesHighlight,
  matrixSourceMatchesHighlight,
  normalizeMatrixHighlightKey
} from "../src/lib/variableHighlight";

describe("variableHighlight matrix expressions", () => {
  it("normalizes matrix highlight keys", () => {
    expect(normalizeMatrixHighlightKey("  +Mh  ")).toBe("+Mh");
    expect(normalizeMatrixHighlightKey("+Mh   *   rl")).toBe("+Mh * rl");
  });

  it("matches full matrix cell sources", () => {
    expect(matrixSourceMatchesHighlight("+Mh", "+Mh")).toBe(true);
    expect(matrixSourceMatchesHighlight("-Ld", "+Mh")).toBe(false);
    expect(matrixSourceMatchesHighlight(" +Mh ", "+Mh")).toBe(true);
  });

  it("matches either variables or matrix sources for document highlights", () => {
    expect(documentMentionMatchesHighlight("Mh", "Mh")).toBe(true);
    expect(documentMentionMatchesHighlight("+Mh", "+Mh")).toBe(true);
    expect(documentMentionMatchesHighlight("Money deposits", "+Mh")).toBe(false);
  });
});
