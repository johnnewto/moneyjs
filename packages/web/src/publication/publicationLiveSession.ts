import { parseNotebookSource } from "../notebook/document";
import { serializeNotebookSource } from "../notebook/notebookSourceWorkflow";
import type { NotebookDocument } from "../notebook/types";

export const PUBLICATION_LIVE_SESSION_STORAGE_KEY = "sfcr:publication-live-session";
const PUBLICATION_LIVE_CHANNEL = "sfcr-publication-live";

interface PublicationLiveSessionRecord {
  documentJson: string;
  returnUrl: string;
  revision: number;
  updatedAt: string;
}

export interface PublicationLiveSessionSnapshot {
  document: NotebookDocument;
  returnUrl: string;
  revision: number;
}

function readSessionRecord(): PublicationLiveSessionRecord | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(PUBLICATION_LIVE_SESSION_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<PublicationLiveSessionRecord>;
    if (typeof parsed.documentJson !== "string" || !parsed.documentJson.trim()) {
      return null;
    }

    return {
      documentJson: parsed.documentJson,
      returnUrl: typeof parsed.returnUrl === "string" ? parsed.returnUrl : "",
      revision: typeof parsed.revision === "number" ? parsed.revision : 0,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : ""
    };
  } catch {
    return null;
  }
}

export function readPublicationLiveSession(): PublicationLiveSessionSnapshot | null {
  const record = readSessionRecord();
  if (!record) {
    return null;
  }

  try {
    const { document } = parseNotebookSource(record.documentJson, "json");
    return {
      document,
      returnUrl: record.returnUrl,
      revision: record.revision
    };
  } catch {
    return null;
  }
}

export function writePublicationLiveSession(args: {
  document: NotebookDocument;
  returnUrl: string;
}): PublicationLiveSessionSnapshot {
  const previous = readSessionRecord();
  const revision = (previous?.revision ?? 0) + 1;
  const documentJson = serializeNotebookSource(args.document, "json");
  const record: PublicationLiveSessionRecord = {
    documentJson,
    returnUrl: args.returnUrl,
    revision,
    updatedAt: new Date().toISOString()
  };

  if (typeof window !== "undefined") {
    window.sessionStorage.setItem(PUBLICATION_LIVE_SESSION_STORAGE_KEY, JSON.stringify(record));
    broadcastPublicationLiveRevision(revision);
  }

  return {
    document: args.document,
    returnUrl: args.returnUrl,
    revision
  };
}

function broadcastPublicationLiveRevision(revision: number): void {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
    return;
  }

  const channel = new BroadcastChannel(PUBLICATION_LIVE_CHANNEL);
  channel.postMessage({ revision });
  channel.close();
}

export function readPublicationLiveReturnUrl(): string | null {
  const returnUrl = readSessionRecord()?.returnUrl?.trim();
  return returnUrl || null;
}

export function subscribePublicationLiveSession(
  listener: (snapshot: PublicationLiveSessionSnapshot) => void
): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  let lastRevision = readSessionRecord()?.revision ?? -1;

  function emitIfChanged(): void {
    const snapshot = readPublicationLiveSession();
    if (!snapshot || snapshot.revision === lastRevision) {
      return;
    }

    lastRevision = snapshot.revision;
    listener(snapshot);
  }

  function handleStorage(event: StorageEvent): void {
    if (event.key === PUBLICATION_LIVE_SESSION_STORAGE_KEY) {
      emitIfChanged();
    }
  }

  window.addEventListener("storage", handleStorage);

  let channel: BroadcastChannel | null = null;
  if (typeof BroadcastChannel !== "undefined") {
    channel = new BroadcastChannel(PUBLICATION_LIVE_CHANNEL);
    channel.onmessage = () => emitIfChanged();
  }

  return () => {
    window.removeEventListener("storage", handleStorage);
    channel?.close();
  };
}
