export type AssistantSseDeltaParser = (event: unknown) => string;

export async function readAssistantSseResponse(
  response: Response,
  parseDelta: AssistantSseDeltaParser,
  onTextDelta?: (delta: string) => void
): Promise<string> {
  if (!response.body) {
    return "";
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";

    for (const chunk of chunks) {
      const eventText = parseAssistantSseChunk(chunk, parseDelta);
      if (eventText) {
        text += eventText;
        onTextDelta?.(eventText);
      }
    }
  }

  buffer += decoder.decode();
  const remainingText = parseAssistantSseChunk(buffer, parseDelta);
  if (remainingText) {
    text += remainingText;
    onTextDelta?.(remainingText);
  }

  return text;
}

export function parseAssistantSseChunk(
  chunk: string,
  parseDelta: AssistantSseDeltaParser
): string {
  const dataLines = chunk
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart());

  let text = "";
  for (const data of dataLines) {
    if (!data || data === "[DONE]") {
      continue;
    }

    try {
      text += parseDelta(JSON.parse(data));
    } catch {
      // Ignore malformed stream frames and continue reading later frames.
    }
  }

  return text;
}