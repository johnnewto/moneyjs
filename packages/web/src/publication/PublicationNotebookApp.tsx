import { useCallback, useEffect, useMemo, useState } from "react";

import type { SimulationResult } from "@sfcr/core";

import { useInspectorVariableHistory } from "../hooks/useInspectorVariableHistory";
import { isSameInspectorContext, type VariableInspectRequest } from "../lib/variableInspect";
import { buildNotebookPathname, buildNotebookVariableUnitMetadata } from "../notebook/notebookAppHelpers";
import { useNotebookRunner } from "../notebook/useNotebookRunner";
import { buildPublicationViewModel, buildPublicationContentsEntries } from "./buildPublicationViewModel";
import { PublicationCellView } from "./PublicationCellView";
import { PublicationContents } from "./PublicationContents";
import { PublicationActionLinks } from "./PublicationActionLinks";
import type { PublicationRouteLocation } from "./publicationRouteHelpers";
import {
  buildPublicationPathnameFromRoute
} from "./publicationRouteHelpers";
import {
  buildPublicationInspectRequest,
  mergePublicationVariableInteraction,
  resolvePublicationInspectContext
} from "./publicationInspect";
import { buildPublicationVariableDescriptions } from "./publicationVariables";
import { PublicationVariableInspectorPopup } from "./PublicationVariableInspectorPopup";
import {
  readPublicationLiveReturnUrl,
  readPublicationLiveSession
} from "./publicationLiveSession";
import {
  resolveInitialPublicationDocument,
  resolvePublicationTemplateId,
  subscribeLivePublicationDocument
} from "./resolvePublicationDocument";
import "../styles/partials/publication.css";

function resolveMaxPeriodIndex(
  getResult: (cellId: string) => SimulationResult | null,
  runCellIds: string[]
): number {
  let max = 0;

  for (const cellId of runCellIds) {
    const result = getResult(cellId);
    if (!result) {
      continue;
    }

    const lengths = Object.values(result.series).map((values) => values.length);
    const periods = result.options.periods ?? (lengths.length > 0 ? Math.max(...lengths) : 0);
    max = Math.max(max, Math.max(periods - 1, 0));
  }

  return max;
}

export function PublicationNotebookApp({ route }: { route: PublicationRouteLocation }) {
  const initialPublication = useMemo(() => resolveInitialPublicationDocument(route), [route]);
  const [notebookDocument, setNotebookDocument] = useState(initialPublication.document);
  const [liveSessionMissing, setLiveSessionMissing] = useState(initialPublication.liveSessionMissing);
  const [documentRevision, setDocumentRevision] = useState<number | null>(null);
  const runner = useNotebookRunner(notebookDocument);
  const [runPhase, setRunPhase] = useState<"pending" | "running" | "done">("pending");
  const [inspectorContext, setInspectorContext] = useState<VariableInspectRequest | null>(null);
  const inspectorHistory = useInspectorVariableHistory();

  const publicationTemplateId = useMemo(
    () => resolvePublicationTemplateId(notebookDocument),
    [notebookDocument]
  );

  useEffect(() => {
    const next = resolveInitialPublicationDocument(route);
    setNotebookDocument(next.document);
    setLiveSessionMissing(next.liveSessionMissing);
    setDocumentRevision((previous) =>
      route.source === "live"
        ? (readPublicationLiveSession()?.revision ?? 0)
        : (previous ?? -1) + 1
    );
  }, [route]);

  useEffect(() => {
    if (route.source !== "live") {
      return;
    }

    return subscribeLivePublicationDocument((document) => {
      setNotebookDocument(document);
      setLiveSessionMissing(false);
      setDocumentRevision((current) => current + 1);
    });
  }, [route.source]);

  const viewModel = useMemo(
    () =>
      buildPublicationViewModel({
        document: notebookDocument,
        templateId: publicationTemplateId,
        mode: route.mode,
        embedCellId: route.embedCellId
      }),
    [notebookDocument, publicationTemplateId, route.embedCellId, route.mode]
  );

  const runCellIds = useMemo(
    () => notebookDocument.cells.filter((cell) => cell.type === "run").map((cell) => cell.id),
    [notebookDocument]
  );

  useEffect(() => {
    if (documentRevision === null) {
      return;
    }

    let cancelled = false;

    void (async () => {
      setRunPhase("running");
      await runner.runAll();
      if (!cancelled) {
        setRunPhase("done");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [documentRevision]);

  const selectedPeriodIndex = useMemo(
    () => resolveMaxPeriodIndex(runner.getResult, runCellIds),
    [runCellIds, runner, runPhase]
  );

  const variableDescriptions = useMemo(
    () => buildPublicationVariableDescriptions(notebookDocument.cells),
    [notebookDocument]
  );

  const variableUnitMetadata = useMemo(
    () => buildNotebookVariableUnitMetadata(notebookDocument.cells),
    [notebookDocument]
  );

  const highlightedVariable = inspectorContext?.selectedVariable ?? null;

  const handleInspectRequest = useCallback(
    (request: VariableInspectRequest) => {
      if (inspectorContext && isSameInspectorContext(inspectorContext, request)) {
        inspectorHistory.push(request.selectedVariable);
      } else {
        inspectorHistory.reset(request.selectedVariable);
      }
      setInspectorContext(request);
    },
    [inspectorContext, inspectorHistory]
  );

  const buildCellInteraction = useCallback(
    (cell: (typeof notebookDocument.cells)[number]) => {
      const inspectContext =
        runPhase === "done"
          ? resolvePublicationInspectContext({
              cell,
              document: notebookDocument,
              getResult: runner.getResult,
              selectedPeriodIndex
            })
          : null;

      return mergePublicationVariableInteraction({
        descriptions: variableDescriptions,
        unitMetadata: variableUnitMetadata,
        inspectContext,
        highlightedVariable,
        onInspectVariable: inspectContext
          ? (selectedVariable) => {
              handleInspectRequest(
                buildPublicationInspectRequest({
                  context: inspectContext,
                  document: notebookDocument,
                  selectedVariable
                })
              );
            }
          : undefined
      });
    },
    [
      handleInspectRequest,
      highlightedVariable,
      notebookDocument,
      runPhase,
      runner.getResult,
      selectedPeriodIndex,
      variableDescriptions,
      variableUnitMetadata
    ]
  );

  const handleInspectorSelectVariable = useCallback(
    (selectedVariable: string) => {
      if (!inspectorContext) {
        return;
      }

      handleInspectRequest({ ...inspectorContext, selectedVariable });
    },
    [handleInspectRequest, inspectorContext]
  );

  const handleInspectorGoBack = useCallback(() => {
    const variableName = inspectorHistory.goBack();
    if (variableName && inspectorContext) {
      setInspectorContext({ ...inspectorContext, selectedVariable: variableName });
    }
  }, [inspectorContext, inspectorHistory]);

  const handleInspectorGoForward = useCallback(() => {
    const variableName = inspectorHistory.goForward();
    if (variableName && inspectorContext) {
      setInspectorContext({ ...inspectorContext, selectedVariable: variableName });
    }
  }, [inspectorContext, inspectorHistory]);

  const handleCloseInspector = useCallback(() => {
    setInspectorContext(null);
  }, []);

  useEffect(() => {
    if (route.mode === "embed" || !route.cellId || runPhase !== "done") {
      return;
    }

    const target = window.document.getElementById(route.cellId);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [route.cellId, route.mode, runPhase]);

  const interactiveNotebookHref =
    readPublicationLiveReturnUrl() ??
    buildNotebookPathname({
      templateId: publicationTemplateId
    });
  const printHref = buildPublicationPathnameFromRoute({
    route: { mode: "print", source: route.source, templateId: route.templateId },
    cellId: route.cellId ?? undefined
  });
  const isEmbed = route.mode === "embed";
  const isPrint = route.mode === "print";
  const embedMissingCell = isEmbed && !route.embedCellId;
  const embedUnknownCell = isEmbed && route.embedCellId && viewModel.bodySections.length === 0;

  const contentsEntries = useMemo(
    () => buildPublicationContentsEntries(viewModel.bodySections),
    [viewModel.bodySections]
  );
  const showContents = !isEmbed && contentsEntries.length > 1;

  const mainContent = (
    <>
      {liveSessionMissing ? (
        <p className="publication-status-hint">
          Live publication snapshot is unavailable. Open publication view from the interactive notebook
          to mirror your current edits.
        </p>
      ) : null}
      {embedMissingCell ? (
        <p className="publication-status-hint">
          Embed URL requires a <code>?cell=</code> query parameter naming a notebook cell id.
        </p>
      ) : null}
      {embedUnknownCell ? (
        <p className="publication-status-hint">
          No embeddable cell found for id <code>{route.embedCellId}</code>.
        </p>
      ) : null}

      {viewModel.bodySections.map((section) => (
        <PublicationCellView
          key={section.anchorId}
          cells={notebookDocument.cells}
          getResult={runner.getResult}
          interaction={buildCellInteraction(section.cell)}
          section={section}
          selectedPeriodIndex={selectedPeriodIndex}
          showHeading={!isEmbed}
        />
      ))}

      {!isEmbed && viewModel.appendixSections.length > 0 ? (
        <section className="publication-appendix publication-page-break-before">
          <h2 className="publication-appendix-title">Appendix</h2>
          {viewModel.appendixSections.map((section) => (
            <PublicationCellView
              key={section.anchorId}
              cells={notebookDocument.cells}
              getResult={runner.getResult}
              interaction={buildCellInteraction(section.cell)}
              section={section}
              selectedPeriodIndex={selectedPeriodIndex}
            />
          ))}
        </section>
      ) : null}
    </>
  );
  return (
    <div
      className={`publication-root publication-mode-${route.mode}${
        runPhase !== "done" ? " publication-is-loading" : ""
      }`}
    >
      {!isEmbed ? (
        <header className="publication-header publication-no-print">
          <p className="publication-eyebrow">MoneyJS publication</p>
          <h1 className="publication-title">{viewModel.title}</h1>
          {runPhase === "running" ? (
            <p className="publication-status">Running simulations…</p>
          ) : null}
        </header>
      ) : null}

      {isEmbed ? (
        <main className="publication-main publication-main-embed">{mainContent}</main>
      ) : (
        <div className="publication-page-shell">
          <div className={`publication-layout${showContents ? " publication-layout-with-contents" : ""}`}>
            <main className="publication-main">{mainContent}</main>
            {showContents ? (
              <PublicationContents
                activeAnchorId={route.cellId}
                entries={contentsEntries}
                interactiveNotebookHref={interactiveNotebookHref}
                isPrint={isPrint}
                route={route}
                printHref={printHref}
              />
            ) : null}
          </div>
        </div>
      )}

      {!isEmbed ? (
        <footer className="publication-footer publication-no-print">
          <PublicationActionLinks
            interactiveNotebookHref={interactiveNotebookHref}
            isPrint={isPrint}
            printHref={printHref}
            variant="footer"
          />
        </footer>
      ) : null}

      {inspectorContext ? (
        <PublicationVariableInspectorPopup
          canGoBack={inspectorHistory.canGoBack}
          canGoForward={inspectorHistory.canGoForward}
          getResult={runner.getResult}
          inspectorContext={inspectorContext}
          notebookDocument={notebookDocument}
          onClose={handleCloseInspector}
          onGoBack={handleInspectorGoBack}
          onGoForward={handleInspectorGoForward}
          onSelectVariable={handleInspectorSelectVariable}
          selectedPeriodIndex={selectedPeriodIndex}
        />
      ) : null}
    </div>
  );
}
