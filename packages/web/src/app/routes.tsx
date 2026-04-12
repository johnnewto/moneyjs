import { useEffect, useState } from "react";

export type AppRoute = "workspace" | "notebook";

export function getRouteFromHash(hash: string): AppRoute {
  return hash.startsWith("#/notebook") ? "notebook" : "workspace";
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
