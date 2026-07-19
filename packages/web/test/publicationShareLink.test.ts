// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  compressNotebookSharePayload,
  NOTEBOOK_SHARE_QUERY_PARAM,
  resolveNotebookShareLinkToCopy,
  tryLoadNotebookFromShareLocation
} from "../src/notebook/notebookShareLink";
import { notebookToJson } from "../src/notebook/document";
import { createNotebookFromTemplate } from "../src/notebook/templates";
import { buildPublicationShareUrl } from "../src/publication/publicationShareLink";

describe("publicationShareLink", () => {
  const originalPath = window.location.pathname;
  const originalSearch = window.location.search;
  const originalHash = window.location.hash;

  afterEach(() => {
    history.replaceState(history.state, "", `${originalPath}${originalSearch}${originalHash}`);
    vi.unstubAllGlobals();
  });

  it("builds a publish/live hash nbz URL (keeps payload off the request line)", () => {
    const document = createNotebookFromTemplate("sim");
    const built = buildPublicationShareUrl({
      document,
      origin: "https://example.test",
      cellId: "intro"
    });

    expect("error" in built).toBe(false);
    if ("error" in built) {
      return;
    }

    expect(built.url).toMatch(/^https:\/\/example\.test\/publish\/live\/intro#\?nbz=/);
    const beforeHash = built.url.split("#")[0]!;
    expect(beforeHash.includes("nbz=")).toBe(false);
  });

  it("round-trips a publish hash share URL into a notebook document", () => {
    const document = createNotebookFromTemplate("sim");
    document.title = "Publish Share Hash";
    const built = buildPublicationShareUrl({
      document,
      origin: "https://example.test"
    });
    expect("error" in built).toBe(false);
    if ("error" in built) {
      return;
    }

    const url = new URL(built.url);
    history.replaceState(history.state, "", `${url.pathname}${url.search}${url.hash}`);

    const loaded = tryLoadNotebookFromShareLocation();
    expect(loaded?.title).toBe("Publish Share Hash");
  });

  it("still loads legacy publish query-string nbz links", () => {
    const document = createNotebookFromTemplate("sim");
    document.title = "Legacy Query Share";
    const nbz = compressNotebookSharePayload(notebookToJson(document));
    history.replaceState(history.state, "", `/publish/live?${NOTEBOOK_SHARE_QUERY_PARAM}=${nbz}`);

    expect(tryLoadNotebookFromShareLocation()?.title).toBe("Legacy Query Share");
  });

  it("shortens publish share URLs through the notebook share API", async () => {
    const document = createNotebookFromTemplate("sim");
    const built = buildPublicationShareUrl({
      document,
      origin: "https://example.test"
    });
    expect("error" in built).toBe(false);
    if ("error" in built) {
      return;
    }

    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ shortUrl: "https://tinyurl.com/pub123" }), {
        headers: { "Content-Type": "application/json" },
        status: 200
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const resolved = await resolveNotebookShareLinkToCopy(built.url);

    expect(resolved).toEqual({
      shortened: true,
      url: "https://tinyurl.com/pub123"
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8787/v1/notebook-share/shorten",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ url: built.url })
      })
    );
  });
});
