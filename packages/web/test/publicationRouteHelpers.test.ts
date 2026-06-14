// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";

import {
  buildPublicationPathname,
  parsePublicationPathname,
  readPublicationRouteLocation
} from "../src/publication/publicationRouteHelpers";

describe("publicationRouteHelpers", () => {
  const originalPath = window.location.pathname;
  const originalSearch = window.location.search;

  afterEach(() => {
    history.replaceState(history.state, "", `${originalPath}${originalSearch}`);
  });

  it("parses publish and print pathnames with optional cell segments", () => {
    expect(parsePublicationPathname("/publish/bmw")).toEqual({
      mode: "publish",
      templateId: "bmw",
      cellId: null,
      embedCellId: null
    });
    expect(parsePublicationPathname("/publish/bmw/balance-sheet")).toEqual({
      mode: "publish",
      templateId: "bmw",
      cellId: "balance-sheet",
      embedCellId: null
    });
    expect(parsePublicationPathname("/print/werner-qtc-explainer")).toEqual({
      mode: "print",
      templateId: "werner-qtc-explainer",
      cellId: null,
      embedCellId: null
    });
  });

  it("reads embed cell id from the query string", () => {
    history.replaceState(history.state, "", "/embed/bmw?cell=balance-sheet");

    expect(readPublicationRouteLocation()).toEqual({
      mode: "embed",
      templateId: "bmw",
      cellId: null,
      embedCellId: "balance-sheet"
    });
  });

  it("builds publication and embed pathnames", () => {
    expect(buildPublicationPathname({ mode: "publish", templateId: "bmw" })).toBe("/publish/bmw");
    expect(
      buildPublicationPathname({
        mode: "embed",
        templateId: "bmw",
        embedCellId: "balance-sheet"
      })
    ).toBe("/embed/bmw?cell=balance-sheet");
  });
});
