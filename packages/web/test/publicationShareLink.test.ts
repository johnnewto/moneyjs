// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import { resolveNotebookShareLinkToCopy } from "../src/notebook/notebookShareLink";
import { createNotebookFromTemplate } from "../src/notebook/templates";
import { buildPublicationShareUrl } from "../src/publication/publicationShareLink";

describe("publicationShareLink", () => {
  it("builds a publish/live nbz URL", () => {
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

    expect(built.url).toMatch(/^https:\/\/example\.test\/publish\/live\/intro\?nbz=/);
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

    vi.unstubAllGlobals();
  });
});
