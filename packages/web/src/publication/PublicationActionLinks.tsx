import { useEffect, useRef, useState } from "react";

export interface PublicationShareResult {
  ok: boolean;
  message: string;
}

export function PublicationActionLinks({
  interactiveNotebookHref,
  isPrint,
  printHref,
  onShare,
  variant = "footer"
}: {
  interactiveNotebookHref: string;
  isPrint: boolean;
  printHref: string;
  onShare?: () => Promise<PublicationShareResult>;
  variant?: "footer" | "sidebar";
}) {
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const resetTimeoutRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (resetTimeoutRef.current != null) {
        window.clearTimeout(resetTimeoutRef.current);
      }
    },
    []
  );

  async function handleShareClick(): Promise<void> {
    if (!onShare || sharing) {
      return;
    }

    setSharing(true);
    setShareStatus(null);
    if (resetTimeoutRef.current != null) {
      window.clearTimeout(resetTimeoutRef.current);
    }

    try {
      const result = await onShare();
      setShareStatus(result.message);
    } catch {
      setShareStatus("Could not create share link.");
    } finally {
      setSharing(false);
      resetTimeoutRef.current = window.setTimeout(() => setShareStatus(null), 4000);
    }
  }

  return (
    <div
      className={
        variant === "sidebar"
          ? "publication-action-links publication-action-links-sidebar"
          : "publication-action-links publication-action-links-footer"
      }
    >
      <a className="publication-interactive-link" href={interactiveNotebookHref}>
        Open interactive notebook
      </a>
      {isPrint ? (
        <button type="button" className="publication-print-button" onClick={() => window.print()}>
          Print / Save as PDF
        </button>
      ) : (
        <a className="publication-print-link" href={printHref}>
          Print view
        </a>
      )}
      {onShare ? (
        <button
          type="button"
          className="publication-share-button"
          onClick={handleShareClick}
          disabled={sharing}
        >
          {sharing ? "Copying link…" : "Copy share link"}
        </button>
      ) : null}
      {shareStatus ? (
        <span className="publication-share-status" role="status">
          {shareStatus}
        </span>
      ) : null}
    </div>
  );
}
