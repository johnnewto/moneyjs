import { useCallback, useEffect, useState, type MouseEvent } from "react";

import type { PublicationContentsEntry } from "./buildPublicationViewModel";
import { PublicationActionLinks, type PublicationShareResult } from "./PublicationActionLinks";
import { PublicationNotebookPicker } from "./PublicationNotebookPicker";
import type { PublicationRouteLocation } from "./publicationRouteHelpers";
import { buildPublicationPathnameFromRoute } from "./publicationRouteHelpers";

export function PublicationContents({
  activeAnchorId,
  entries,
  interactiveNotebookHref,
  isPrint,
  onOpenGraph,
  onShare,
  printHref,
  route,
  showCatalog = false
}: {
  activeAnchorId: string | null;
  entries: PublicationContentsEntry[];
  interactiveNotebookHref: string;
  isPrint: boolean;
  onOpenGraph?: () => void;
  onShare?: () => Promise<PublicationShareResult>;
  printHref: string;
  route: PublicationRouteLocation;
  showCatalog?: boolean;
}) {
  const [trackedAnchorId, setTrackedAnchorId] = useState<string | null>(activeAnchorId);

  useEffect(() => {
    setTrackedAnchorId(activeAnchorId);
  }, [activeAnchorId]);

  useEffect(() => {
    if (entries.length === 0 || typeof IntersectionObserver === "undefined") {
      return;
    }

    const elements = entries
      .map((entry) => window.document.getElementById(entry.anchorId))
      .filter((element): element is HTMLElement => element instanceof HTMLElement);

    if (elements.length === 0) {
      return;
    }

    const observer = new IntersectionObserver(
      (records) => {
        const intersecting = records
          .filter((record) => record.isIntersecting)
          .sort((left, right) => right.intersectionRatio - left.intersectionRatio);

        const nextId = intersecting[0]?.target.id?.trim();
        if (nextId) {
          setTrackedAnchorId(nextId);
        }
      },
      {
        root: null,
        rootMargin: "-15% 0px -65% 0px",
        threshold: [0, 0.15, 0.5, 1]
      }
    );

    for (const element of elements) {
      observer.observe(element);
    }

    return () => observer.disconnect();
  }, [entries]);

  const handleNavigate = useCallback(
    (anchorId: string, event: MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      window.document.getElementById(anchorId)?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
      setTrackedAnchorId(anchorId);
      window.history.replaceState(
        null,
        "",
        buildPublicationPathnameFromRoute({
          route,
          cellId: anchorId
        })
      );
    },
    [route]
  );

  if (entries.length === 0 && !showCatalog) {
    return null;
  }

  const highlightedAnchorId = trackedAnchorId ?? activeAnchorId;

  return (
    <aside className="publication-contents publication-no-print" aria-label="Contents">
      <nav className="publication-contents-nav">
        {showCatalog ? (
          <PublicationNotebookPicker id="publication-notebook-picker-sidebar" route={route} />
        ) : null}
        {entries.length > 0 ? (
          <>
            <h2 className="publication-contents-title">Contents</h2>
            <ol className="publication-contents-list">
              {entries.map((entry) => (
                <li key={entry.anchorId} data-level={entry.level}>
                  <a
                    className={
                      highlightedAnchorId === entry.anchorId
                        ? "publication-contents-link is-active"
                        : "publication-contents-link"
                    }
                    href={buildPublicationPathnameFromRoute({
                      route,
                      cellId: entry.anchorId
                    })}
                    onClick={(event) => handleNavigate(entry.anchorId, event)}
                  >
                    {entry.title}
                  </a>
                </li>
              ))}
            </ol>
          </>
        ) : null}
        <PublicationActionLinks
          interactiveNotebookHref={interactiveNotebookHref}
          isPrint={isPrint}
          onOpenGraph={onOpenGraph}
          onShare={onShare}
          printHref={printHref}
          variant="sidebar"
        />
      </nav>
    </aside>
  );
}
