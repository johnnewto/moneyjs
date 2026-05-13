import { describe, expect, it } from "vitest";

import {
  extractAssistantTokenUsage,
  formatAssistantTokenUsage,
  mergeAssistantTokenUsage,
  parseAssistantSseChunk
} from "../src/assistant/sse";

describe("assistant SSE parsing", () => {
  it("combines output text deltas and ignores done frames", () => {
    const chunk = [
      'data: {"type":"response.output_text.delta","delta":"Hello"}',
      'data: {"type":"response.output_text.delta","delta":" world"}',
      "data: [DONE]"
    ].join("\n");

    const text = parseAssistantSseChunk(chunk, (event) => {
      if (
        event &&
        typeof event === "object" &&
        "type" in event &&
        "delta" in event &&
        event.type === "response.output_text.delta" &&
        typeof event.delta === "string"
      ) {
        return event.delta;
      }

      return "";
    });

    expect(text).toBe("Hello world");
  });

  it("skips malformed frames and unsupported event types", () => {
    const chunk = [
      "data: not-json",
      'data: {"type":"response.created"}',
      'data: {"type":"response.output_text.delta","delta":"ok"}'
    ].join("\n");

    const text = parseAssistantSseChunk(chunk, (event) => {
      if (
        event &&
        typeof event === "object" &&
        "type" in event &&
        "delta" in event &&
        event.type === "response.output_text.delta" &&
        typeof event.delta === "string"
      ) {
        return event.delta;
      }

      return "";
    });

    expect(text).toBe("ok");
  });

  it("extracts token usage from Responses API completion events", () => {
    const event = {
      type: "response.completed",
      response: {
        usage: {
          input_tokens: 18342,
          input_tokens_details: { cached_tokens: 1200 },
          output_tokens: 912,
          output_tokens_details: { reasoning_tokens: 128 },
          total_tokens: 19254
        }
      }
    };

    expect(extractAssistantTokenUsage(event)).toEqual({
      cachedInputTokens: 1200,
      inputTokens: 18342,
      outputTokens: 912,
      reasoningTokens: 128,
      totalTokens: 19254
    });
  });

  it("formats token usage for notebook toasts", () => {
    expect(
      formatAssistantTokenUsage(
        {
          cachedInputTokens: 1200,
          inputTokens: 18342,
          outputTokens: 912,
          reasoningTokens: 128,
          totalTokens: 19254
        },
        "gpt-5.4-mini"
      )
    ).toBe("LLM usage: gpt-5.4-mini - 18.3k in, 912 out, 19.3k total, 1,200 cached, 128 reasoning.");
  });

  it("merges usage across multi-request assistant turns", () => {
    expect(
      mergeAssistantTokenUsage(
        { inputTokens: 1000, outputTokens: 200, totalTokens: 1200 },
        { inputTokens: 3000, outputTokens: 400, reasoningTokens: 50, totalTokens: 3400 }
      )
    ).toEqual({
      inputTokens: 4000,
      outputTokens: 600,
      reasoningTokens: 50,
      totalTokens: 4600
    });
  });
});
