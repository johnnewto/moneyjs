import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from "lz-string";

import { notebookToJson, parseNotebookSource } from "./document";
import type { NotebookDocument } from "./types";

export const NOTEBOOK_SHARE_QUERY_PARAM = "nbz";
export const NOTEBOOK_SHARE_CELL_QUERY_PARAM = "cell";
const NOTEBOOK_SHARE_HASH_ROUTE = "#/notebook";
export const NOTEBOOK_SHARE_MAX_COMPRESSED_LENGTH = 128_000;

export interface NotebookShareSearchParams {
  cellId: string | null;
  nbz: string;
}

export function compressNotebookSharePayload(source: string): string {
  return compressToEncodedURIComponent(source);
}

export function decompressNotebookSharePayload(nbz: string): string | null {
  const trimmed = nbz.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const source = decompressFromEncodedURIComponent(trimmed);
    return source || null;
  } catch {
    return null;
  }
}

export function parseNotebookShareSearch(search: string): NotebookShareSearchParams | null {
  const normalized = search.trim();
  if (!normalized) {
    return null;
  }

  const params = new URLSearchParams(normalized.startsWith("?") ? normalized.slice(1) : normalized);
  const nbz = params.get(NOTEBOOK_SHARE_QUERY_PARAM)?.trim();
  if (!nbz) {
    return null;
  }

  const cellId = params.get(NOTEBOOK_SHARE_CELL_QUERY_PARAM)?.trim() || null;
  return { nbz, cellId };
}

function parseNotebookShareHash(hash: string): NotebookShareSearchParams | null {
  const normalized = hash.trim();
  if (!normalized.startsWith(`${NOTEBOOK_SHARE_HASH_ROUTE}?`)) {
    return null;
  }

  return parseNotebookShareSearch(normalized.slice(NOTEBOOK_SHARE_HASH_ROUTE.length));
}

export function readNotebookShareSearchSource(): string {
  if (typeof window === "undefined") {
    return "";
  }

  if (parseNotebookShareSearch(window.location.search)) {
    return window.location.search;
  }

  const fromHash = parseNotebookShareHash(window.location.hash);
  if (fromHash) {
    const params = new URLSearchParams();
    params.set(NOTEBOOK_SHARE_QUERY_PARAM, fromHash.nbz);
    if (fromHash.cellId) {
      params.set(NOTEBOOK_SHARE_CELL_QUERY_PARAM, fromHash.cellId);
    }
    return `?${params.toString()}`;
  }

  return "";
}

export function tryLoadNotebookFromShareLocation(): NotebookDocument | null {
  return tryLoadNotebookFromShareSearch(readNotebookShareSearchSource());
}

export function hasNotebookShareSearch(search: string): boolean {
  return parseNotebookShareSearch(search) != null;
}

export function hasNotebookShareInLocation(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return (
    hasNotebookShareSearch(window.location.search) || parseNotebookShareHash(window.location.hash) != null
  );
}

export function tryLoadNotebookFromShareSearch(search: string): NotebookDocument | null {
  const parsed = parseNotebookShareSearch(search);
  if (!parsed) {
    return null;
  }

  const source = decompressNotebookSharePayload(parsed.nbz);
  if (!source) {
    return null;
  }

  try {
    return parseNotebookSource(source, "json").document;
  } catch {
    return null;
  }
}

export function readNotebookShareCellIdFromLocation(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return (
    parseNotebookShareSearch(window.location.search)?.cellId ??
    parseNotebookShareHash(window.location.hash)?.cellId ??
    null
  );
}

export function buildNotebookShareUrl(args: {
  basePath: string;
  cellId?: string | null;
  document: NotebookDocument;
  origin: string;
}): { url: string } | { error: string } {
  const source = notebookToJson(args.document);
  const nbz = compressNotebookSharePayload(source);
  if (nbz.length > NOTEBOOK_SHARE_MAX_COMPRESSED_LENGTH) {
    return {
      error: `Notebook is too large to share as a URL (${nbz.length} characters compressed; limit is ${NOTEBOOK_SHARE_MAX_COMPRESSED_LENGTH}). Use Save or Export instead.`
    };
  }

  const basePath = args.basePath.replace(/\/?$/, "/");
  const origin = args.origin.replace(/\/$/, "");
  const params = new URLSearchParams();
  params.set(NOTEBOOK_SHARE_QUERY_PARAM, nbz);
  const cellId = args.cellId?.trim();
  if (cellId) {
    params.set(NOTEBOOK_SHARE_CELL_QUERY_PARAM, cellId);
  }

  // Hash routing keeps nbz off the HTTP request line (avoids HTTP 414 on GitHub Pages).
  return {
    url: `${origin}${basePath}${NOTEBOOK_SHARE_HASH_ROUTE}?${params.toString()}`
  };
}

function resolveNotebookShareShortenApiUrl(): string {
  const configuredAssistantUrl = (import.meta.env.VITE_NOTEBOOK_ASSISTANT_API_URL ?? "").trim();
  if (configuredAssistantUrl) {
    return configuredAssistantUrl.replace(/\/v1\/notebook-assistant\/ask\/?$/, "/v1/notebook-share/shorten");
  }

  const configuredChatUrl = (import.meta.env.VITE_CHAT_BUILDER_API_URL ?? "").trim();
  if (configuredChatUrl) {
    return configuredChatUrl.replace(/\/v1\/chat-builder\/draft\/?$/, "/v1/notebook-share/shorten");
  }

  if (
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
  ) {
    return "http://localhost:8787/v1/notebook-share/shorten";
  }

  return "";
}

async function shortenNotebookShareUrl(longUrl: string): Promise<string | null> {
  const apiUrl = resolveNotebookShareShortenApiUrl();
  if (!apiUrl) {
    return null;
  }

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ url: longUrl })
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as { shortUrl?: unknown };
    return typeof payload.shortUrl === "string" && payload.shortUrl.trim()
      ? payload.shortUrl.trim()
      : null;
  } catch {
    return null;
  }
}

export async function resolveNotebookShareLinkToCopy(
  longUrl: string
): Promise<{ shortened: boolean; url: string }> {
  const shortUrl = await shortenNotebookShareUrl(longUrl);
  if (shortUrl) {
    return { shortened: true, url: shortUrl };
  }

  return { shortened: false, url: longUrl };
}

export function clearNotebookShareQueryFromLocation(): void {
  if (typeof window === "undefined") {
    return;
  }

  const searchParams = new URLSearchParams(window.location.search);
  const hadSearchShare =
    searchParams.has(NOTEBOOK_SHARE_QUERY_PARAM) || searchParams.has(NOTEBOOK_SHARE_CELL_QUERY_PARAM);
  if (hadSearchShare) {
    searchParams.delete(NOTEBOOK_SHARE_QUERY_PARAM);
    searchParams.delete(NOTEBOOK_SHARE_CELL_QUERY_PARAM);
  }

  const hadHashShare = parseNotebookShareHash(window.location.hash) != null;
  const nextSearch = searchParams.toString();
  const nextHash = hadHashShare ? "" : window.location.hash;
  if (!hadSearchShare && !hadHashShare) {
    return;
  }

  const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${nextHash}`;
  history.replaceState(history.state, "", nextUrl);
}
