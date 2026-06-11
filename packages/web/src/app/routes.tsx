import { isNotebookPathname } from "../notebook/notebookAppHelpers";

export type AppRoute = "notebook";

const LEGACY_ROUTE_PREFIXES = ["#/workspace", "#/chat-builder"];

export function getAppRoute(pathname = window.location.pathname, hash = window.location.hash): AppRoute {
  if (LEGACY_ROUTE_PREFIXES.some((prefix) => hash.startsWith(prefix))) {
    return "notebook";
  }

  if (hash.startsWith("#/notebook") || isNotebookPathname(pathname)) {
    return "notebook";
  }

  return "notebook";
}

/** @deprecated Use getAppRoute. */
export function getRouteFromHash(hash: string): AppRoute {
  return getAppRoute(window.location.pathname, hash);
}
