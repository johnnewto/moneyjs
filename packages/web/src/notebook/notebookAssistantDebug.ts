export type NotebookAssistantDebugEventType =
  | "turn:start"
  | "context:built"
  | "request:start"
  | "request:skipped"
  | "response:received"
  | "stream:delta"
  | "tool:extracted"
  | "tool:blocked"
  | "tool:result"
  | "patch:proposed"
  | "turn:error"
  | "turn:done";

export interface NotebookAssistantDebugEvent {
  at: number;
  detail?: unknown;
  id: string;
  label: string;
  phase?: "first" | "followup";
  turnId: string;
  type: NotebookAssistantDebugEventType;
}

export function createNotebookAssistantDebugEvent(args: {
  detail?: unknown;
  label: string;
  phase?: NotebookAssistantDebugEvent["phase"];
  turnId: string;
  type: NotebookAssistantDebugEventType;
}): NotebookAssistantDebugEvent {
  const at = Date.now();
  return {
    at,
    detail: args.detail,
    id: `${args.turnId}-${args.type}-${at}-${Math.random().toString(36).slice(2, 8)}`,
    label: args.label,
    phase: args.phase,
    turnId: args.turnId,
    type: args.type
  };
}

export function formatNotebookAssistantDebugTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(timestamp));
}

export function serializeNotebookAssistantDebugEvents(events: NotebookAssistantDebugEvent[]): string {
  return events.map((event) => JSON.stringify(event)).join("\n");
}

export function stringifyNotebookAssistantDebugDetail(detail: unknown): string {
  if (detail == null) {
    return "";
  }

  if (typeof detail === "string") {
    return detail;
  }

  try {
    return JSON.stringify(detail, null, 2);
  } catch {
    return String(detail);
  }
}