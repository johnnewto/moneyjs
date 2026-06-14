import {
  DEFAULT_NOTEBOOK_TEMPLATE_ID,
  isNotebookTemplateId,
  type NotebookTemplateId
} from "../notebook/templates";

const APP_BASE_URL = import.meta.env.BASE_URL;

export type PublicationRenderMode = "publish" | "embed" | "print";
export type PublicationDocumentSource = "template" | "live";

export const PUBLICATION_LIVE_ROUTE_ID = "live";

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

export function readPublicationRouteLocation(): PublicationRouteLocation | null {
  return parsePublicationPathname(window.location.pathname);
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
  return /^\/(publish|embed|print)\//.test(path);
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
