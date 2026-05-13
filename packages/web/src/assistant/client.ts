import { extractAssistantTokenUsage, type AssistantTokenUsage } from "./sse";

export interface OpenAiTextResponse {
  output?: Array<{
    content?: Array<{
      text?: string;
    }>;
  }>;
  output_text?: string;
  usage?: unknown;
}

export async function postAssistantJson(args: {
  body: unknown;
  fallbackErrorMessage: string;
  url: string;
}): Promise<Response> {
  const response = await fetch(args.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(args.body)
  });

  if (!response.ok) {
    throw new Error(await readAssistantErrorMessage(response, args.fallbackErrorMessage));
  }

  return response;
}

export function extractOpenAiTextResponse(result: OpenAiTextResponse): string | null {
  if (typeof result.output_text === "string" && result.output_text.trim()) {
    return result.output_text;
  }

  return (
    result.output
      ?.flatMap((entry) => entry.content ?? [])
      .find((entry) => typeof entry.text === "string" && entry.text.trim())?.text ?? null
  );
}

export function extractOpenAiUsageResponse(result: OpenAiTextResponse): AssistantTokenUsage | undefined {
  return extractAssistantTokenUsage(result) ?? undefined;
}

async function readAssistantErrorMessage(
  response: Response,
  fallbackErrorMessage: string
): Promise<string> {
  try {
    const error = (await response.json()) as {
      error?: string | {
        message?: string;
      };
    };
    return typeof error.error === "string"
      ? error.error
      : error.error?.message ?? fallbackErrorMessage;
  } catch {
    return fallbackErrorMessage;
  }
}
