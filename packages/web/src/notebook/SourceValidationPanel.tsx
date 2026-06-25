import type { NotebookSourceValidation } from "./notebookSourceWorkflow";

export function SourceValidationPanel({
  successMessage,
  validation
}: {
  successMessage?: string;
  validation: NotebookSourceValidation;
}) {
  const blockingIssueCount = validation.notebookIssueCount + validation.modelIssueCount;
  const warningCount = validation.notebookWarningCount + validation.modelWarningCount;
  const notebookChecksValid = blockingIssueCount === 0;

  return (
    <section className="notebook-source-validation-panel" aria-label="Notebook source validation">
      {validation.issues.length > 0 ? (
        <ul className="notebook-source-validation-list">
          {validation.issues.slice(0, 5).map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      ) : null}
      {validation.canApply ? (
        <div className="status-hint">
          {successMessage ??
            (warningCount > 0
              ? "Source can be applied; unit and other warnings are advisory."
              : "Source is ready to apply.")}
        </div>
      ) : null}
    </section>
  );
}
