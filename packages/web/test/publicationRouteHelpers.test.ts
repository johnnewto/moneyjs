// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";

import {
  buildPublicationPathname,
  isBarePublishPathname,
  isInteractiveNotebookReturnUrl,
  isPublicationPathname,
  migratePublicationHashToPathname,
  parsePublicationHash,
  parsePublicationPathname,
  readPublicationRouteLocation,
  resolveInteractiveNotebookHref
} from "../src/publication/publicationRouteHelpers";

describe("publicationRouteHelpers", () => {
  const originalPath = window.location.pathname;
  const originalSearch = window.location.search;
  const originalHash = window.location.hash;

  afterEach(() => {
    history.replaceState(history.state, "", `${originalPath}${originalSearch}${originalHash}`);
  });

  it("parses publish and print pathnames with optional cell segments", () => {
    expect(parsePublicationPathname("/publish")).toEqual({
      mode: "publish",
      source: "template",
      templateId: "bmw",
      cellId: null,
      embedCellId: null
    });
    expect(parsePublicationPathname("/publish/")).toEqual({
      mode: "publish",
      source: "template",
      templateId: "bmw",
      cellId: null,
      embedCellId: null
    });
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

  it("treats app root and bare /publish as the default publish entry", () => {
    expect(parsePublicationPathname("/")).toEqual({
      mode: "publish",
      source: "template",
      templateId: "bmw",
      cellId: null,
      embedCellId: null
    });
    expect(isPublicationPathname("/")).toBe(true);
    expect(isPublicationPathname("/publish")).toBe(true);
    expect(isPublicationPathname("/publish/")).toBe(true);
    expect(isBarePublishPathname("/")).toBe(true);
    expect(isBarePublishPathname("/publish")).toBe(true);
    expect(isBarePublishPathname("/publish/bmw")).toBe(false);
  });

  it("keeps hash notebook entry on app root out of publish mode", () => {
    history.replaceState(history.state, "", "/#/notebook");
    expect(readPublicationRouteLocation()).toBeNull();

    history.replaceState(history.state, "", "/");
    expect(readPublicationRouteLocation()).toEqual({
      mode: "publish",
      source: "template",
      templateId: "bmw",
      cellId: null,
      embedCellId: null
    });
  });

  it("recovers Pages 404 hash rewrites for publish deep links", () => {
    history.replaceState(history.state, "", "/#/publish/italy-sfc");
    expect(parsePublicationHash("#/publish/italy-sfc")).toEqual({
      mode: "publish",
      source: "template",
      templateId: "italy-sfc",
      cellId: null,
      embedCellId: null
    });
    expect(readPublicationRouteLocation()).toEqual({
      mode: "publish",
      source: "template",
      templateId: "italy-sfc",
      cellId: null,
      embedCellId: null
    });

    migratePublicationHashToPathname();
    expect(window.location.pathname).toBe("/publish/italy-sfc");
    expect(window.location.hash).toBe("");
    expect(readPublicationRouteLocation()).toEqual({
      mode: "publish",
      source: "template",
      templateId: "italy-sfc",
      cellId: null,
      embedCellId: null
    });
  });

  it("recovers Pages 404 hash rewrites for publish cell deep links", () => {
    history.replaceState(history.state, "", "/#/publish/italy-sfc/balance-sheet");
    expect(readPublicationRouteLocation()).toEqual({
      mode: "publish",
      source: "template",
      templateId: "italy-sfc",
      cellId: "balance-sheet",
      embedCellId: null
    });

    migratePublicationHashToPathname();
    expect(window.location.pathname).toBe("/publish/italy-sfc/balance-sheet");
    expect(window.location.hash).toBe("");
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

  it("resolves interactive notebook hrefs without looping back to publish", () => {
    expect(
      resolveInteractiveNotebookHref({
        source: "template",
        templateId: "sim",
        liveReturnUrl: "/"
      })
    ).toBe("/notebook/sim");

    expect(
      resolveInteractiveNotebookHref({
        source: "template",
        templateId: "bmw",
        liveReturnUrl: "/notebook/bmw"
      })
    ).toBe("/notebook/bmw");

    expect(
      resolveInteractiveNotebookHref({
        source: "live",
        templateId: "bmw",
        liveReturnUrl: "/notebook/bmw/intro"
      })
    ).toBe("/notebook/bmw/intro");

    expect(
      resolveInteractiveNotebookHref({
        source: "live",
        templateId: "bmw",
        liveReturnUrl: "/"
      })
    ).toBe("/notebook/bmw");

    expect(
      resolveInteractiveNotebookHref({
        source: "live",
        templateId: "bmw",
        liveReturnUrl: "/publish/live"
      })
    ).toBe("/notebook/bmw");

    expect(isInteractiveNotebookReturnUrl("/")).toBe(false);
    expect(isInteractiveNotebookReturnUrl("/publish/bmw")).toBe(false);
    expect(isInteractiveNotebookReturnUrl("/notebook/bmw")).toBe(true);
  });
});
