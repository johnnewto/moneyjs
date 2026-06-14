import {
  isNotebookTemplateId,
  type NotebookTemplateId
} from "../notebook/templates";

const APP_BASE_URL = import.meta.env.BASE_URL;

export type PublicationRenderMode = "publish" | "embed" | "print";

export interface PublicationRouteLocation {
  mode: PublicationRenderMode;
  templateId: NotebookTemplateId;
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
  if (!isNotebookTemplateId(candidate)) {
    return null;
  }

  const cellId = match[3]?.trim() || null;
  const embedCellId =
    mode === "embed" ? new URLSearchParams(window.location.search).get("cell")?.trim() || null : null;

  return {
    mode,
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
  templateId: NotebookTemplateId;
  cellId?: string;
  embedCellId?: string;
}): string {
  const base = APP_BASE_URL.replace(/\/$/, "");
  const route =
    args.mode === "embed"
      ? `/embed/${args.templateId}`
      : args.cellId
        ? `/${args.mode}/${args.templateId}/${args.cellId}`
        : `/${args.mode}/${args.templateId}`;
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
