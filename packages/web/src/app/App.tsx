import { lazy, Suspense, useEffect } from "react";

import "../styles/app.css";

const NotebookApp = lazy(() =>
  import("../notebook/NotebookApp").then((module) => ({ default: module.NotebookApp }))
);

const LEGACY_ROUTE_PREFIXES = ["#/workspace", "#/chat-builder"];

function redirectLegacyRoutes(): void {
  const hash = window.location.hash;
  if (!LEGACY_ROUTE_PREFIXES.some((prefix) => hash.startsWith(prefix))) {
    return;
  }

  window.location.replace(`${window.location.pathname}${window.location.search}#/notebook`);
}

export function App() {
  useEffect(() => {
    redirectLegacyRoutes();

    const onRouteChange = () => redirectLegacyRoutes();
    window.addEventListener("hashchange", onRouteChange);
    return () => window.removeEventListener("hashchange", onRouteChange);
  }, []);

  return (
    <Suspense fallback={<div className="app-loading">Loading notebook...</div>}>
      <NotebookApp />
    </Suspense>
  );
}
