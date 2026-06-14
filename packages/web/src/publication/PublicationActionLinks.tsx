export function PublicationActionLinks({
  interactiveNotebookHref,
  isPrint,
  printHref,
  variant = "footer"
}: {
  interactiveNotebookHref: string;
  isPrint: boolean;
  printHref: string;
  variant?: "footer" | "sidebar";
}) {
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
    </div>
  );
}
