import type { Dispatch, SetStateAction } from "react";
import { createNotebookDiagnostic } from "@sfcr/notebook-core";

import { extractOpenAiTextResponse, postAssistantJson } from "../assistant/client";
import { readAssistantSseResponse } from "../assistant/sse";
import type { NotebookPatch, NotebookPatchResult } from "./notebookPatch";
import { previewNotebookPatch } from "./notebookPatch";
import { notebookToJson } from "./document";
import {
  formatNotebookAssistantMode,
  getNotebookAssistantModeContract,
  type NotebookAssistantMode
} from "./notebookAssistantFlow";
import {
  summarizeNotebookAssistantTools,
  summarizeNotebookAssistantToolSyntax,
  summarizeNotebookEquationExpressionSyntax
} from "./notebookAssistantTools";
import { summarizeCellTypes } from "./notebookSourceWorkflow";
import type { NotebookDocument } from "./types";

export const NOTEBOOK_ASSISTANT_API_URL = resolveNotebookAssistantApiUrl();
export const NOTEBOOK_ASSISTANT_DEFAULT_MODEL = "gpt-4.1";
export const NOTEBOOK_ASSISTANT_MODEL_STORAGE_KEY = "sfcr:notebook-assistant-model";
export const NOTEBOOK_ASSISTANT_MODE_STORAGE_KEY = "sfcr:notebook-assistant-mode";
export const NOTEBOOK_ASSISTANT_MAX_TOOL_REQUESTS_PER_ROUND = 8;

export interface NotebookAssistantMessage {
  id: string;
  patch?: NotebookAssistantInlinePatch;
  role: "assistant" | "user";
  text: string;
}

export interface NotebookAssistantInlinePatch {
  isJsonVisible: boolean;
  isJsonDirty?: boolean;
  jsonText?: string;
  patch: NotebookPatch;
  preview: NotebookPatchResult;
  status: "ready" | "applied" | "discarded";
}

export const NOTEBOOK_ASSISTANT_INITIAL_MESSAGES: NotebookAssistantMessage[] = [
  {
    id: "assistant-1",
    role: "assistant",
    text: "Ask about the current notebook, selected variable, validation state, or run results. I will explain and suggest changes without applying them."
  }
];

export async function requestNotebookAssistantAnswer(args: {
  betaPassword: string;
  context: string;
  messages: NotebookAssistantMessage[];
  model: string;
  onTextDelta?: (delta: string) => void;
  question: string;
}): Promise<string> {
  if (!NOTEBOOK_ASSISTANT_API_URL) {
    throw new Error("Notebook assistant API endpoint is not configured.");
  }

  const response = await postAssistantJson({
    fallbackErrorMessage: "Failed to ask notebook assistant.",
    url: NOTEBOOK_ASSISTANT_API_URL,
    body: {
      ...(args.betaPassword.trim() ? { betaPassword: args.betaPassword.trim() } : {}),
      context: args.context,
      messages: args.messages.map((message) => ({
        role: message.role,
        text: message.text
      })),
      model: args.model,
      question: args.question
    }
  });

  const contentType = response.headers.get("Content-Type") ?? "";
  if (response.body && contentType.includes("text/event-stream")) {
    const streamedText = await readNotebookAssistantSseResponse(response, args.onTextDelta);
    if (streamedText.trim()) {
      return streamedText.trim();
    }
  }

  const text = extractOpenAiTextResponse(await response.json());

  if (!text) {
    throw new Error("Assistant response did not include text.");
  }

  args.onTextDelta?.(text);
  return text;
}

export function setNotebookAssistantMessageText(
  setMessages: Dispatch<SetStateAction<NotebookAssistantMessage[]>>,
  messageId: string,
  text: string
): void {
  setMessages((current) =>
    current.map((message) => (message.id === messageId ? { ...message, text } : message))
  );
}

export function setNotebookAssistantMessagePatch(
  setMessages: Dispatch<SetStateAction<NotebookAssistantMessage[]>>,
  messageId: string,
  patch: NotebookPatch,
  document: NotebookDocument
): void {
  const preview = previewNotebookPatch(document, patch);
  setMessages((current) =>
    current.map((message) =>
      message.id === messageId
        ? {
            ...message,
            patch: {
              isJsonVisible: false,
              patch,
              preview,
              status: "ready"
            }
          }
        : message
    )
  );
}

export function rearmNotebookAssistantMessagePatchAfterUndo(
  messages: NotebookAssistantMessage[],
  document: NotebookDocument,
  messageId?: string
): NotebookAssistantMessage[] {
  if (!messageId) {
    return messages;
  }

  return messages.map((message) => {
    if (message.id !== messageId || !message.patch || message.patch.status !== "applied") {
      return message;
    }

    return {
      ...message,
      patch: {
        ...message.patch,
        preview: previewNotebookPatch(document, message.patch.patch),
        status: "ready"
      }
    };
  });
}

export function buildNotebookAssistantContext(args: {
  document: NotebookDocument;
  inspectorContext: {
    currentValues: Record<string, number | undefined>;
    selectedVariable: string;
  } | null;
  resultCount: number;
  assistantMode: NotebookAssistantMode;
  selectedPeriodIndex: number;
  selectedVariable?: string;
  uiMessage: string | null;
}): string {
  const notebookJson = notebookToJson(args.document);
  return truncateNotebookAssistantContext(
    [
      `Notebook title: ${args.document.title}`,
      `Notebook id: ${args.document.id}`,
      `Assistant mode: ${formatNotebookAssistantMode(args.assistantMode)}`,
      `Assistant mode contract: ${getNotebookAssistantModeContract(args.assistantMode)}`,
      `Cells: ${args.document.cells.length}`,
      `Cell types: ${summarizeCellTypes(args.document.cells)}`,
      `Available notebook assistant tools: ${summarizeNotebookAssistantTools()}`,
      `Notebook assistant tool syntax:\n${summarizeNotebookAssistantToolSyntax(args.assistantMode)}`,
      `Notebook equation expression syntax:\n${summarizeNotebookEquationExpressionSyntax()}`,
      `Selected period index: ${args.selectedPeriodIndex}`,
      `Completed run result count: ${args.resultCount}`,
      args.selectedVariable ? `Selected variable: ${args.selectedVariable}` : null,
      args.inspectorContext
        ? `Selected variable current values: ${JSON.stringify(args.inspectorContext.currentValues)}`
        : null,
      args.uiMessage ? `Current UI message: ${args.uiMessage}` : null,
      "Notebook JSON:",
      notebookJson
    ]
      .filter((line): line is string => Boolean(line))
      .join("\n")
  );
}

export function createAssistantPatchIssue(message: string) {
  return createNotebookDiagnostic({ message }, { domain: "assistant" }) as NotebookPatchResult["issues"][number];
}

function resolveNotebookAssistantApiUrl(): string {
  const configuredAssistantUrl = (import.meta.env.VITE_NOTEBOOK_ASSISTANT_API_URL ?? "").trim();
  if (configuredAssistantUrl) {
    return configuredAssistantUrl;
  }

  const configuredChatUrl = (import.meta.env.VITE_CHAT_BUILDER_API_URL ?? "").trim();
  if (configuredChatUrl) {
    return configuredChatUrl.replace(/\/v1\/chat-builder\/draft\/?$/, "/v1/notebook-assistant/ask");
  }

  if (
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
  ) {
    return "http://localhost:8787/v1/notebook-assistant/ask";
  }

  return "";
}

async function readNotebookAssistantSseResponse(
  response: Response,
  onTextDelta: ((delta: string) => void) | undefined
): Promise<string> {
  return readAssistantSseResponse(response, parseNotebookAssistantSseEvent, onTextDelta);
}

function parseNotebookAssistantSseEvent(event: unknown): string {
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
}

function truncateNotebookAssistantContext(context: string): string {
  const maxLength = 56000;
  if (context.length <= maxLength) {
    return context;
  }

  return `${context.slice(0, maxLength)}\n\n[Context truncated for size.]`;
}
