import { afterEach, describe, expect, it, vi } from "vitest";

import worker from "../src/index.ts";

const env = {
  ALLOWED_ORIGINS: "https://johnnewto.github.io",
  DISCOVERY_ALLOWED_ORIGINS: "https://johnnewto.github.io",
  OPENAI_API_KEY: "test-key",
  OPENAI_MODEL_ALLOWLIST: "gpt-5.5"
};

describe("chat API notebook share shortening", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects shorten requests without a configured TinyURL token", async () => {
    const response = await worker.fetch(createShareShortenRequest("https://johnnewto.github.io/moneyjs/notebook?nbz=abc"), {
      ...env,
      TINYURL_API_TOKEN: ""
    });

    await expect(response.json()).resolves.toEqual({ error: "TINYURL_API_TOKEN is not configured." });
    expect(response.status).toBe(503);
  });

  it("rejects shorten requests for non-notebook URLs", async () => {
    const response = await worker.fetch(createShareShortenRequest("https://johnnewto.github.io/moneyjs/"), {
      ...env,
      TINYURL_API_TOKEN: "tiny-token"
    });

    await expect(response.json()).resolves.toEqual({ error: "url must target a notebook share route." });
    expect(response.status).toBe(400);
  });

  it("accepts hash-based notebook share URLs", async () => {
    const longUrl = "https://johnnewto.github.io/moneyjs/#/notebook?nbz=compressed";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ data: { tiny_url: "https://tinyurl.com/hash" } }), {
          headers: { "Content-Type": "application/json" },
          status: 200
        })
      )
    );

    const response = await worker.fetch(createShareShortenRequest(longUrl), {
      ...env,
      TINYURL_API_TOKEN: "tiny-token"
    });

    await expect(response.json()).resolves.toEqual({ shortUrl: "https://tinyurl.com/hash" });
    expect(response.status).toBe(200);
  });

  it("returns a TinyURL short link for valid notebook share URLs", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: {
            tiny_url: "https://tinyurl.com/2yd2kg5z"
          }
        }),
        { headers: { "Content-Type": "application/json" }, status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const longUrl = "https://johnnewto.github.io/moneyjs/notebook?nbz=compressed";
    const response = await worker.fetch(createShareShortenRequest(longUrl), {
      ...env,
      TINYURL_API_TOKEN: "tiny-token"
    });

    await expect(response.json()).resolves.toEqual({ shortUrl: "https://tinyurl.com/2yd2kg5z" });
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.tinyurl.com/create",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer tiny-token"
        }),
        body: JSON.stringify({ url: longUrl })
      })
    );
  });
});

describe("chat API discovery resources", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects draft requests with untrusted discovery origins", async () => {
    const response = await worker.fetch(createDraftRequest("https://example.com/.well-known/sfcr.json"), env);

    await expect(response.json()).resolves.toEqual({ error: "discoveryUrl origin is not allowed." });
    expect(response.status).toBe(400);
  });

  it("rejects untrusted resource origins inside trusted discovery documents", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          resources: {
            notebooks: {
              guide: "../notebook-guide.md",
              manifest: "https://example.com/sfcr-notebook-guide.json",
              prompt: "../ai-prompts/create-sfcr-notebook.md",
              schema: "../sfcr-notebook.schema.json"
            }
          }
        }),
        { headers: { "Content-Type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await worker.fetch(createDraftRequest("https://johnnewto.github.io/.well-known/sfcr.json"), env);

    await expect(response.json()).resolves.toEqual({ error: "SFCR discovery resource origin is not allowed." });
    expect(response.status).toBe(500);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

function createDraftRequest(discoveryUrl: string): Request {
  return new Request("https://sfcr-chat-api.example/v1/chat-builder/draft", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://johnnewto.github.io"
    },
    body: JSON.stringify({
      discoveryUrl,
      messages: [],
      model: "gpt-5.5",
      prompt: "Build a notebook."
    })
  });
}

function createShareShortenRequest(url: string): Request {
  return new Request("https://sfcr-chat-api.example/v1/notebook-share/shorten", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://johnnewto.github.io"
    },
    body: JSON.stringify({ url })
  });
}
