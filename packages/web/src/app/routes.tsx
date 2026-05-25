import { useEffect, useState } from "react";

import { isNotebookPathname } from "../notebook/notebookAppHelpers";

export type AppRoute = "workspace" | "notebook" | "chat-builder";

export function getAppRoute(pathname = window.location.pathname, hash = window.location.hash): AppRoute {
  if (hash.startsWith("#/chat-builder")) {
    return "chat-builder";
  }

  if (hash.startsWith("#/workspace")) {
    return "workspace";
  }

  if (isNotebookPathname(pathname) || hash.startsWith("#/notebook")) {
    return "notebook";
  }

  return "notebook";
}

/** @deprecated Use getAppRoute. */
export function getRouteFromHash(hash: string): AppRoute {
  return getAppRoute(window.location.pathname, hash);
}

export function useAppRoute(): AppRoute {
  const [route, setRoute] = useState<AppRoute>(() => getAppRoute());

  useEffect(() => {
    function handleRouteChange() {
      setRoute(getAppRoute());
    }

    window.addEventListener("hashchange", handleRouteChange);
    window.addEventListener("popstate", handleRouteChange);
    return () => {
      window.removeEventListener("hashchange", handleRouteChange);
      window.removeEventListener("popstate", handleRouteChange);
    };
  }, []);

  return route;
}
