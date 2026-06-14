import { lazy, Suspense, useEffect, useMemo, useState } from "react";

import "../styles/app.css";
import { readPublicationRouteLocation } from "../publication/publicationRouteHelpers";

const NotebookApp = lazy(() =>
  import("../notebook/NotebookApp").then((module) => ({ default: module.NotebookApp }))
);

const PublicationNotebookApp = lazy(() =>
  import("../publication/PublicationNotebookApp").then((module) => ({
    default: module.PublicationNotebookApp
  }))
);

const LEGACY_ROUTE_PREFIXES = ["#/workspace", "#/chat-builder"];

function redirectLegacyRoutes(): void {
  const hash = window.location.hash;
  if (!LEGACY_ROUTE_PREFIXES.some((prefix) => hash.startsWith(prefix))) {
    return;
  }

  window.location.replace(`${window.location.pathname}${window.location.search}#/notebook`);
}

function AppContent() {
  const [routeRevision, setRouteRevision] = useState(0);

  useEffect(() => {
    function handleRouteChange(): void {
      setRouteRevision((current) => current + 1);
    }

    window.addEventListener("popstate", handleRouteChange);
    return () => window.removeEventListener("popstate", handleRouteChange);
  }, []);

  const publicationRoute = useMemo(
    () => readPublicationRouteLocation(),
    [routeRevision]
  );

  if (publicationRoute) {
    return <PublicationNotebookApp route={publicationRoute} />;
  }

  return <NotebookApp />;
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
      <AppContent />
    </Suspense>
  );
}
