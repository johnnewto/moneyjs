// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";

import {
  buildNotebookHash,
  buildNotebookPathname,
  buildNotebookReturnUrl,
  parseNotebookCellIdFromHash,
  parseNotebookPathname,
  readNotebookRouteLocation,
  writeNotebookLocation
} from "../src/notebook/notebookAppHelpers";

describe("notebookAppHelpers hash routing", () => {
  const originalPath = window.location.pathname;
  const originalSearch = window.location.search;
  const originalHash = window.location.hash;

  afterEach(() => {
    history.replaceState(history.state, "", `${originalPath}${originalSearch}${originalHash}`);
  });

  it("parses template and cell segments from a notebook pathname", () => {
    history.replaceState(history.state, "", "/notebook/bmw/transaction-flow-sequence");

    expect(parseNotebookPathname(window.location.pathname)).toEqual({
      templateId: "bmw",
      variantId: null,
      cellId: "transaction-flow-sequence"
    });
    expect(readNotebookRouteLocation()).toEqual({
      templateId: "bmw",
      variantId: null,
      cellId: "transaction-flow-sequence"
    });
  });

  it("parses variant and cell segments from a variant pathname", () => {
    history.replaceState(history.state, "", "/notebook/variant/my-variant/transaction-flow-sequence");

    expect(readNotebookRouteLocation()).toEqual({
      templateId: null,
      variantId: "my-variant",
      cellId: "transaction-flow-sequence"
    });
  });

  it("still parses legacy hash notebook links when pathname is not set", () => {
    history.replaceState(history.state, "", "/");
    window.location.hash = "#/notebook/bmw#transaction-flow-sequence";

    expect(readNotebookRouteLocation()).toEqual({
      templateId: "bmw",
      variantId: null,
      cellId: "transaction-flow-sequence"
    });
  });

  it("builds notebook pathnames with optional cell segments", () => {
    expect(buildNotebookPathname({ templateId: "bmw" })).toBe("/notebook/bmw");
    expect(buildNotebookPathname({ templateId: "bmw", cellId: "transaction-flow-sequence" })).toBe(
      "/notebook/bmw/transaction-flow-sequence"
    );
    expect(
      buildNotebookPathname({ variantId: "my-variant", cellId: "transaction-flow-sequence" })
    ).toBe("/notebook/variant/my-variant/transaction-flow-sequence");
  });

  it("builds notebook return URLs from the current notebook route, not app root", () => {
    history.replaceState(history.state, "", "/#/notebook/bmw/intro");
    expect(buildNotebookReturnUrl()).toBe("/notebook/bmw/intro");

    history.replaceState(history.state, "", "/notebook/variant/my-variant");
    expect(buildNotebookReturnUrl()).toBe("/notebook/variant/my-variant");
  });

  it("writes pathname URLs and clears stray hash fragments", () => {
    history.replaceState(history.state, "", "/notebook/bmw");
    window.location.hash = "#/notebook/bmw/transaction-flow-sequence";

    writeNotebookLocation({ templateId: "bmw", cellId: "transaction-flow-sequence" });

    expect(window.location.pathname).toBe("/notebook/bmw/transaction-flow-sequence");
    expect(window.location.hash).toBe("");
  });

  it("keeps legacy hash builders for compatibility", () => {
    expect(buildNotebookHash({ templateId: "bmw", cellId: "transaction-flow-sequence" })).toBe(
      "#/notebook/bmw/transaction-flow-sequence"
    );
    expect(parseNotebookCellIdFromHash("#/notebook/bmw/transaction-flow-sequence")).toBe(
      "transaction-flow-sequence"
    );
  });
});
