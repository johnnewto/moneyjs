import { Profiler } from "react";
import type { ReactNode } from "react";

const NOTEBOOK_PROFILER_STORAGE_KEY = "sfcr:notebook-profiler";
const NOTEBOOK_PROFILER_GLOBAL_KEY = "__sfcrNotebookProfiler";
const NOTEBOOK_PROFILER_EVENT_LIMIT = 2000;
const isDevEnvironment =
  ((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV ?? false) === true;

type NotebookProfilerMetadataValue = boolean | number | string | null | undefined;

interface NotebookProfilerEvent {
  actualDuration: number;
  baseDuration: number;
  commitTime: number;
  id: string;
  metadata?: Record<string, NotebookProfilerMetadataValue>;
  phase: "mount" | "nested-update" | "update";
  startTime: number;
  timestamp: number;
}

interface NotebookProfilerSummaryRow {
  averageActualDuration: number;
  count: number;
  id: string;
  lastActualDuration: number;
  maxActualDuration: number;
  metadata: string;
  phase: NotebookProfilerEvent["phase"];
  totalActualDuration: number;
}

interface NotebookProfilerStore {
  clear(): void;
  events: NotebookProfilerEvent[];
  printGroupedByMetadata(metadataKey: string): void;
  printRecent(limit?: number): void;
  printSummary(): void;
}

declare global {
  interface Window {
    __sfcrNotebookProfiler?: NotebookProfilerStore;
  }
}

export function NotebookRenderProfiler({
  children,
  id,
  metadata
}: {
  children: ReactNode;
  id: string;
  metadata?: Record<string, NotebookProfilerMetadataValue>;
}) {
  if (!isNotebookProfilerEnabled()) {
    return <>{children}</>;
  }

  return (
    <Profiler
      id={id}
      onRender={(_id, phase, actualDuration, baseDuration, startTime, commitTime) => {
        recordNotebookProfilerEvent({
          actualDuration,
          baseDuration,
          commitTime,
          id,
          metadata,
          phase,
          startTime,
          timestamp: performance.now()
        });
      }}
    >
      {children}
    </Profiler>
  );
}

function isNotebookProfilerEnabled(): boolean {
  if (!isDevEnvironment || typeof window === "undefined") {
    return false;
  }

  try {
    return window.localStorage.getItem(NOTEBOOK_PROFILER_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function recordNotebookProfilerEvent(event: NotebookProfilerEvent): void {
  if (typeof window === "undefined") {
    return;
  }

  const store = ensureNotebookProfilerStore();
  store.events.push({
    ...event,
    actualDuration: roundDuration(event.actualDuration),
    baseDuration: roundDuration(event.baseDuration),
    commitTime: roundDuration(event.commitTime),
    startTime: roundDuration(event.startTime),
    timestamp: roundDuration(event.timestamp)
  });

  if (store.events.length > NOTEBOOK_PROFILER_EVENT_LIMIT) {
    store.events.splice(0, store.events.length - NOTEBOOK_PROFILER_EVENT_LIMIT);
  }
}

function ensureNotebookProfilerStore(): NotebookProfilerStore {
  if (typeof window === "undefined") {
    return buildNotebookProfilerStore();
  }

  const existingStore = window[NOTEBOOK_PROFILER_GLOBAL_KEY];
  if (existingStore) {
    return existingStore;
  }

  const store = buildNotebookProfilerStore();
  window[NOTEBOOK_PROFILER_GLOBAL_KEY] = store;
  console.info(
    "[sfcr:notebook-profiler] Capturing notebook render events in window.__sfcrNotebookProfiler. Call printSummary() or printRecent()."
  );
  return store;
}

function buildNotebookProfilerStore(): NotebookProfilerStore {
  const events: NotebookProfilerEvent[] = [];

  return {
    clear() {
      events.length = 0;
    },
    events,
    printGroupedByMetadata(metadataKey: string) {
      console.table(summarizeNotebookProfilerEventsByMetadata(events, metadataKey));
    },
    printRecent(limit = 20) {
      console.table(events.slice(Math.max(events.length - limit, 0)));
    },
    printSummary() {
      console.table(summarizeNotebookProfilerEvents(events));
    }
  };
}

function summarizeNotebookProfilerEvents(
  events: NotebookProfilerEvent[]
): NotebookProfilerSummaryRow[] {
  const groups = new Map<
    string,
    {
      count: number;
      id: string;
      lastActualDuration: number;
      maxActualDuration: number;
      metadata: string;
      phase: NotebookProfilerEvent["phase"];
      totalActualDuration: number;
    }
  >();

  events.forEach((event) => {
    const metadata = formatProfilerMetadata(event.metadata);
    const key = `${event.id}:${event.phase}:${metadata}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      existing.lastActualDuration = event.actualDuration;
      existing.maxActualDuration = Math.max(existing.maxActualDuration, event.actualDuration);
      existing.totalActualDuration += event.actualDuration;
      return;
    }

    groups.set(key, {
      count: 1,
      id: event.id,
      lastActualDuration: event.actualDuration,
      maxActualDuration: event.actualDuration,
      metadata,
      phase: event.phase,
      totalActualDuration: event.actualDuration
    });
  });

  return Array.from(groups.values())
    .map((entry) => ({
      averageActualDuration: roundDuration(entry.totalActualDuration / entry.count),
      count: entry.count,
      id: entry.id,
      lastActualDuration: roundDuration(entry.lastActualDuration),
      maxActualDuration: roundDuration(entry.maxActualDuration),
      metadata: entry.metadata,
      phase: entry.phase,
      totalActualDuration: roundDuration(entry.totalActualDuration)
    }))
    .sort((left, right) => right.totalActualDuration - left.totalActualDuration);
}

function summarizeNotebookProfilerEventsByMetadata(
  events: NotebookProfilerEvent[],
  metadataKey: string
): Array<NotebookProfilerSummaryRow & { metadataKey: string; metadataValue: string }> {
  const groups = new Map<
    string,
    {
      count: number;
      id: string;
      lastActualDuration: number;
      maxActualDuration: number;
      metadata: string;
      metadataValue: string;
      phase: NotebookProfilerEvent["phase"];
      totalActualDuration: number;
    }
  >();

  events.forEach((event) => {
    const metadataValue = formatProfilerMetadataValue(event.metadata?.[metadataKey]);
    const metadata = formatProfilerMetadata(event.metadata);
    const key = `${event.id}:${event.phase}:${metadataKey}:${metadataValue}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      existing.lastActualDuration = event.actualDuration;
      existing.maxActualDuration = Math.max(existing.maxActualDuration, event.actualDuration);
      existing.totalActualDuration += event.actualDuration;
      return;
    }

    groups.set(key, {
      count: 1,
      id: event.id,
      lastActualDuration: event.actualDuration,
      maxActualDuration: event.actualDuration,
      metadata,
      metadataValue,
      phase: event.phase,
      totalActualDuration: event.actualDuration
    });
  });

  return Array.from(groups.values())
    .map((entry) => ({
      averageActualDuration: roundDuration(entry.totalActualDuration / entry.count),
      count: entry.count,
      id: entry.id,
      lastActualDuration: roundDuration(entry.lastActualDuration),
      maxActualDuration: roundDuration(entry.maxActualDuration),
      metadata: entry.metadata,
      metadataKey,
      metadataValue: entry.metadataValue,
      phase: entry.phase,
      totalActualDuration: roundDuration(entry.totalActualDuration)
    }))
    .sort((left, right) => right.totalActualDuration - left.totalActualDuration);
}

function formatProfilerMetadata(
  metadata: Record<string, NotebookProfilerMetadataValue> | undefined
): string {
  if (!metadata) {
    return "";
  }

  return Object.entries(metadata)
    .filter(([, value]) => value !== undefined)
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(" ");
}

function formatProfilerMetadataValue(value: NotebookProfilerMetadataValue): string {
  return value === undefined ? "(missing)" : String(value);
}

function roundDuration(value: number): number {
  return Math.round(value * 100) / 100;
}