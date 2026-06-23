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
      source: "template",
      templateId: "bmw",
      cellId: null,
      embedCellId: null
    });
    expect(parsePublicationPathname("/publish/bmw/balance-sheet")).toEqual({
      mode: "publish",
      source: "template",
      templateId: "bmw",
      cellId: "balance-sheet",
      embedCellId: null
    });
    expect(parsePublicationPathname("/print/sim")).toEqual({
      mode: "print",
      source: "template",
      templateId: "sim",
      cellId: null,
      embedCellId: null
    });
  });

  it("parses live publication routes", () => {
    expect(parsePublicationPathname("/publish/live")).toEqual({
      mode: "publish",
      source: "live",
      templateId: null,
      cellId: null,
      embedCellId: null
    });
    expect(parsePublicationPathname("/publish/live/intro")).toEqual({
      mode: "publish",
      source: "live",
      templateId: null,
      cellId: "intro",
      embedCellId: null
    });
  });

  it("reads embed cell id from the query string", () => {
    history.replaceState(history.state, "", "/embed/bmw?cell=balance-sheet");

    expect(readPublicationRouteLocation()).toEqual({
      mode: "embed",
      source: "template",
      templateId: "bmw",
      cellId: null,
      embedCellId: "balance-sheet"
    });
  });

  it("builds publication and embed pathnames", () => {
    expect(buildPublicationPathname({ mode: "publish", templateId: "bmw" })).toBe("/publish/bmw");
    expect(buildPublicationPathname({ mode: "publish", source: "live" })).toBe("/publish/live");
    expect(
      buildPublicationPathname({
        mode: "embed",
        templateId: "bmw",
        embedCellId: "balance-sheet"
      })
    ).toBe("/embed/bmw?cell=balance-sheet");
  });
});
