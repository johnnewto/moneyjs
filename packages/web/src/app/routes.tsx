import { useEffect, useState } from "react";

export type AppRoute = "workspace" | "notebook" | "chat-builder";

export function getRouteFromHash(hash: string): AppRoute {
  if (hash.startsWith("#/chat-builder")) {
    return "chat-builder";
  }

  return hash.startsWith("#/workspace") ? "workspace" : "notebook";
}

export function useAppRoute(): AppRoute {
  const [route, setRoute] = useState<AppRoute>(() => getRouteFromHash(window.location.hash));

  useEffect(() => {
    function handleHashChange() {
      setRoute(getRouteFromHash(window.location.hash));
    }

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  return route;
}
