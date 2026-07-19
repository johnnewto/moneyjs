import {
  buildNotebookPathname,
  parseNotebookPathname
} from "../notebook/notebookAppHelpers";
import {
  DEFAULT_NOTEBOOK_TEMPLATE_ID,
  isNotebookTemplateId,
  type NotebookTemplateId
} from "../notebook/templates";

const APP_BASE_URL = import.meta.env.BASE_URL;

export type PublicationRenderMode = "publish" | "embed" | "print";
export type PublicationDocumentSource = "template" | "live";

const PUBLICATION_LIVE_ROUTE_ID = "live";

export interface PublicationRouteLocation {
  mode: PublicationRenderMode;
  source: PublicationDocumentSource;
  templateId: NotebookTemplateId | null;
  cellId: string | null;
  embedCellId: string | null;
}

function stripAppBasePath(pathname: string): string {
  const base = APP_BASE_URL.replace(/\/$/, "");
  if (!base || base === "/") {
    return pathname;
  }

  if (pathname.startsWith(base)) {
    const rest = pathname.slice(base.length);
    return rest.startsWith("/") ? rest : `/${rest}`;
  }

  return pathname;
}

export function parsePublicationPathname(pathname: string): PublicationRouteLocation | null {
  const path = stripAppBasePath(pathname);

  // App root and bare /publish default to the BMW template catalog landing.
  if (isDefaultPublishEntryPath(path)) {
    return {
      mode: "publish",
      source: "template",
      templateId: DEFAULT_NOTEBOOK_TEMPLATE_ID,
      cellId: null,
      embedCellId: null
    };
  }

  const match = path.match(/^\/(publish|embed|print)\/([^/]+)(?:\/([^/]+))?\/?$/);
  if (!match) {
    return null;
  }

  const mode = match[1] as PublicationRenderMode;
  const candidate = match[2].trim();
  const cellId = match[3]?.trim() || null;
  const embedCellId =
    mode === "embed" ? new URLSearchParams(window.location.search).get("cell")?.trim() || null : null;

  if (candidate === PUBLICATION_LIVE_ROUTE_ID) {
    return {
      mode,
      source: "live",
      templateId: null,
      cellId: mode === "embed" ? null : cellId,
      embedCellId
    };
  }

  if (!isNotebookTemplateId(candidate)) {
    return null;
  }

  return {
    mode,
    source: "template",
    templateId: candidate,
    cellId: mode === "embed" ? null : cellId,
    embedCellId
  };
}

/**
 * GitHub Pages serves `404.html` for unknown paths and rewrites them to
 * `/#/publish/...` (and notebook `/#/notebook/...`). Recover the publication
 * route from that hash when the pathname is still the app root.
 *
 * Share links use `/publish/live#?nbz=...`. After the Pages rewrite that becomes
 * `/#/publish/live#?nbz=...` — strip the share suffix before parsing the route.
 */
export function parsePublicationHash(hash: string): PublicationRouteLocation | null {
  const parts = splitPublicationHash(hash);
  if (!parts) {
    return null;
  }
  return parsePublicationPathname(parts.routePath);
}

/**
 * Split a Pages rewrite hash into the publication route path and an optional
 * share query (`nbz=...`). Handles:
 * - `#/publish/live`
 * - `#/publish/live#?nbz=...` (404 rewrite preserving original share hash)
 * - `#/publish/live?nbz=...`
 */
export function splitPublicationHash(hash: string): {
  routePath: string;
  shareQuery: string | null;
} | null {
  if (!hasPublicationHashEntry(hash)) {
    return null;
  }

  const rest = hash.slice(1);
  const doubleHashIdx = rest.indexOf("#?");
  if (doubleHashIdx !== -1) {
    return {
      routePath: rest.slice(0, doubleHashIdx),
      shareQuery: rest.slice(doubleHashIdx + 2) || null
    };
  }

  const queryIdx = rest.indexOf("?");
  if (queryIdx !== -1) {
    return {
      routePath: rest.slice(0, queryIdx),
      shareQuery: rest.slice(queryIdx + 1) || null
    };
  }

  return { routePath: rest, shareQuery: null };
}

export function readPublicationRouteLocation(): PublicationRouteLocation | null {
  const strippedPath = stripAppBasePath(window.location.pathname);
  const hash = window.location.hash;

  // Root `/` is also the hash notebook entry (`/#/notebook…`); keep the editor there.
  if (isAppRootPath(strippedPath) && hasNotebookHashEntry(hash)) {
    return null;
  }

  // Prefer Pages 404 hash rewrite over the default BMW landing on app root.
  if (isAppRootPath(strippedPath)) {
    const fromHash = parsePublicationHash(hash);
    if (fromHash) {
      return fromHash;
    }
  }

  return parsePublicationPathname(window.location.pathname);
}

/** Restore a real `/publish|embed|print/...` pathname after a Pages 404 hash rewrite. */
export function migratePublicationHashToPathname(): void {
  if (typeof window === "undefined") {
    return;
  }

  const parts = splitPublicationHash(window.location.hash);
  if (!parts) {
    return;
  }

  const fromHash = parsePublicationPathname(parts.routePath);
  if (!fromHash) {
    return;
  }
  if (!isAppRootPath(stripAppBasePath(window.location.pathname))) {
    return;
  }

  const nextPath = buildPublicationPathname({
    mode: fromHash.mode,
    source: fromHash.source,
    templateId: fromHash.templateId ?? undefined,
    cellId: fromHash.cellId ?? undefined,
    embedCellId: fromHash.embedCellId ?? undefined
  });
  // Keep nbz in the hash (not the query string) so a later navigation/404 cannot
  // put a multi-kilobyte request URI back on the wire.
  const shareHash =
    parts.shareQuery && parts.shareQuery.includes("nbz=") ? `#?${parts.shareQuery}` : "";
  const nextUrl =
    fromHash.mode === "embed" ? nextPath : `${nextPath}${window.location.search}${shareHash}`;
  history.replaceState(history.state, "", nextUrl);
}

export function buildPublicationPathname(args: {
  mode: PublicationRenderMode;
  source?: PublicationDocumentSource;
  templateId?: NotebookTemplateId;
  cellId?: string;
  embedCellId?: string;
}): string {
  const base = APP_BASE_URL.replace(/\/$/, "");
  const source = args.source ?? "template";
  const segment =
    source === "live"
      ? PUBLICATION_LIVE_ROUTE_ID
      : args.templateId ?? DEFAULT_NOTEBOOK_TEMPLATE_ID;
  const route =
    args.mode === "embed"
      ? `/embed/${segment}`
      : args.cellId
        ? `/${args.mode}/${segment}/${args.cellId}`
        : `/${args.mode}/${segment}`;
  const path = base ? `${base}${route}` : route;

  if (args.mode === "embed" && args.embedCellId) {
    const params = new URLSearchParams();
    params.set("cell", args.embedCellId);
    return `${path}?${params.toString()}`;
  }

  return path;
}

export function isPublicationPathname(pathname: string): boolean {
  const path = stripAppBasePath(pathname);
  if (isAppRootPath(path)) {
    return true;
  }
  return /^\/(publish|embed|print)(\/|$)/.test(path);
}

function isAppRootPath(path: string): boolean {
  return path === "/" || path === "";
}

function isDefaultPublishEntryPath(path: string): boolean {
  return isAppRootPath(path) || /^\/publish\/?$/.test(path);
}

function hasNotebookHashEntry(hash: string): boolean {
  return (
    hash.startsWith("#/notebook") ||
    hash.startsWith("#/workspace") ||
    hash.startsWith("#/chat-builder")
  );
}

function hasPublicationHashEntry(hash: string): boolean {
  return (
    hash.startsWith("#/publish") ||
    hash.startsWith("#/embed") ||
    hash.startsWith("#/print")
  );
}

/** True when the path should canonicalize to `/publish/bmw` (root or bare `/publish`). */
export function isBarePublishPathname(pathname: string): boolean {
  const path = stripAppBasePath(pathname);
  return isDefaultPublishEntryPath(path);
}

export function buildPublicationPathnameFromRoute(args: {
  route: Pick<PublicationRouteLocation, "mode" | "source" | "templateId">;
  cellId?: string;
}): string {
  return buildPublicationPathname({
    mode: args.route.mode,
    source: args.route.source,
    templateId: args.route.templateId ?? undefined,
    cellId: args.cellId
  });
}

export function navigateToPublicationView(pathname: string): void {
  window.history.pushState(window.history.state, "", pathname);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

/**
 * True when a live-session return URL points at the interactive notebook editor,
 * not the publication surface (including app root `/`, which is the publish landing).
 */
export function isInteractiveNotebookReturnUrl(href: string): boolean {
  const trimmed = href.trim();
  if (!trimmed) {
    return false;
  }

  try {
    const url = new URL(trimmed, window.location.href);
    if (isPublicationPathname(url.pathname)) {
      return false;
    }
    return parseNotebookPathname(url.pathname) != null;
  } catch {
    return false;
  }
}

/**
 * Resolve the "Open interactive notebook" target for a publication view.
 * Template publications always link to `/notebook/<id>`. Live publications prefer
 * the session return URL when it still points at the notebook editor.
 */
export function resolveInteractiveNotebookHref(args: {
  source: PublicationDocumentSource;
  templateId: NotebookTemplateId;
  liveReturnUrl?: string | null;
}): string {
  if (args.source === "live") {
    const returnUrl = args.liveReturnUrl?.trim() || null;
    if (returnUrl && isInteractiveNotebookReturnUrl(returnUrl)) {
      return returnUrl;
    }
  }

  return buildNotebookPathname({ templateId: args.templateId });
}
