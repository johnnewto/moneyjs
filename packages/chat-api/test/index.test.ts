import { afterEach, describe, expect, it, vi } from "vitest";

import worker from "../src/index.ts";

const env = {
  ALLOWED_ORIGINS: "https://johnnewto.github.io",
  DISCOVERY_ALLOWED_ORIGINS: "https://johnnewto.github.io",
  OPENAI_API_KEY: "test-key",
  OPENAI_MODEL_ALLOWLIST: "gpt-5.5"
};

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
