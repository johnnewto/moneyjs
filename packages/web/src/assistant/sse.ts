export type AssistantSseDeltaParser = (event: unknown) => string;

export interface AssistantTokenUsage {
  cachedInputTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;
}

export interface AssistantSseReadResult {
  text: string;
  usage?: AssistantTokenUsage;
}

export async function readAssistantSseResponse(
  response: Response,
  parseDelta: AssistantSseDeltaParser,
  onTextDelta?: (delta: string) => void
): Promise<AssistantSseReadResult> {
  if (!response.body) {
    return { text: "" };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let usage: AssistantTokenUsage | undefined;
  const collectEvent = (event: unknown) => {
    usage = extractAssistantTokenUsage(event) ?? usage;
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";

    for (const chunk of chunks) {
      const eventText = parseAssistantSseChunk(chunk, parseDelta, collectEvent);
      if (eventText) {
        text += eventText;
        onTextDelta?.(eventText);
      }
    }
  }

  buffer += decoder.decode();
  const remainingText = parseAssistantSseChunk(buffer, parseDelta, collectEvent);
  if (remainingText) {
    text += remainingText;
    onTextDelta?.(remainingText);
  }

  return { text, usage };
}

export function parseAssistantSseChunk(
  chunk: string,
  parseDelta: AssistantSseDeltaParser,
  onEvent?: (event: unknown) => void
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
      const event = JSON.parse(data) as unknown;
      onEvent?.(event);
      text += parseDelta(event);
    } catch {
      // Ignore malformed stream frames and continue reading later frames.
    }
  }

  return text;
}

export function extractAssistantTokenUsage(event: unknown): AssistantTokenUsage | null {
  if (!isRecord(event)) {
    return null;
  }

  const candidate = isRecord(event.usage)
    ? event.usage
    : isRecord(event.response) && isRecord(event.response.usage)
      ? event.response.usage
      : null;
  if (!candidate) {
    return null;
  }

  const inputTokens = readNumber(candidate.input_tokens);
  const outputTokens = readNumber(candidate.output_tokens);
  const totalTokens = readNumber(candidate.total_tokens);
  const cachedInputTokens = isRecord(candidate.input_tokens_details)
    ? readNumber(candidate.input_tokens_details.cached_tokens)
    : undefined;
  const reasoningTokens = isRecord(candidate.output_tokens_details)
    ? readNumber(candidate.output_tokens_details.reasoning_tokens)
    : undefined;

  if (
    inputTokens == null &&
    outputTokens == null &&
    totalTokens == null &&
    cachedInputTokens == null &&
    reasoningTokens == null
  ) {
    return null;
  }

  return {
    ...(cachedInputTokens != null ? { cachedInputTokens } : {}),
    ...(inputTokens != null ? { inputTokens } : {}),
    ...(outputTokens != null ? { outputTokens } : {}),
    ...(reasoningTokens != null ? { reasoningTokens } : {}),
    ...(totalTokens != null ? { totalTokens } : {})
  };
}

export function formatAssistantTokenUsage(usage: AssistantTokenUsage, model?: string): string {
  const parts = [
    usage.inputTokens != null ? `${formatTokenCount(usage.inputTokens)} in` : null,
    usage.outputTokens != null ? `${formatTokenCount(usage.outputTokens)} out` : null,
    usage.totalTokens != null ? `${formatTokenCount(usage.totalTokens)} total` : null,
    usage.cachedInputTokens != null && usage.cachedInputTokens > 0
      ? `${formatTokenCount(usage.cachedInputTokens)} cached`
      : null,
    usage.reasoningTokens != null && usage.reasoningTokens > 0
      ? `${formatTokenCount(usage.reasoningTokens)} reasoning`
      : null
  ].filter((part): part is string => Boolean(part));

  if (parts.length === 0) {
    return model ? `LLM usage: ${model}.` : "LLM usage received.";
  }

  return `LLM usage${model ? `: ${model}` : ""} - ${parts.join(", ")}.`;
}

export function mergeAssistantTokenUsage(
  left: AssistantTokenUsage | undefined,
  right: AssistantTokenUsage | undefined
): AssistantTokenUsage | undefined {
  if (!left) {
    return right;
  }
  if (!right) {
    return left;
  }

  return {
    ...sumUsageField("cachedInputTokens", left, right),
    ...sumUsageField("inputTokens", left, right),
    ...sumUsageField("outputTokens", left, right),
    ...sumUsageField("reasoningTokens", left, right),
    ...sumUsageField("totalTokens", left, right)
  };
}

function sumUsageField(
  field: keyof AssistantTokenUsage,
  left: AssistantTokenUsage,
  right: AssistantTokenUsage
): Partial<AssistantTokenUsage> {
  const leftValue = left[field];
  const rightValue = right[field];
  if (leftValue == null && rightValue == null) {
    return {};
  }

  return { [field]: (leftValue ?? 0) + (rightValue ?? 0) };
}

function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${Number((tokens / 1_000_000).toFixed(1))}M`;
  }
  if (tokens >= 10_000) {
    return `${Number((tokens / 1_000).toFixed(1))}k`;
  }
  return tokens.toLocaleString("en-US");
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}