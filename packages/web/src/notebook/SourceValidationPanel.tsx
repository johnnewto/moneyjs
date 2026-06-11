import type { NotebookSourceValidation, ValidationStep } from "./notebookSourceWorkflow";

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
      <div className="notebook-source-validation-grid">
        <ValidationStepBadge label="Parse" step={validation.parse} />
        <ValidationStepBadge label="Schema" step={validation.schema} />
        <div
          className={`notebook-source-validation-step${
            notebookChecksValid ? (warningCount > 0 ? " is-warning" : " is-valid") : " is-invalid"
          }`}
        >
          <span>Notebook checks</span>
          <strong>
            {!notebookChecksValid
              ? `${blockingIssueCount} issue${blockingIssueCount === 1 ? "" : "s"}`
              : warningCount > 0
                ? `${warningCount} warning${warningCount === 1 ? "" : "s"}`
                : "valid"}
          </strong>
        </div>
      </div>

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

function ValidationStepBadge({ label, step }: { label: string; step: ValidationStep }) {
  return (
    <div className={`notebook-source-validation-step is-${step.status}`}>
      <span>{label}</span>
      <strong>{step.message}</strong>
    </div>
  );
}
