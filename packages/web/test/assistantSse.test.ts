import { describe, expect, it } from "vitest";

import { parseAssistantSseChunk } from "../src/assistant/sse";

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
});
