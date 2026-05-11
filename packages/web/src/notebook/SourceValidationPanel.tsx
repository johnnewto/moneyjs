import type { NotebookSourceValidation, ValidationStep } from "./notebookSourceWorkflow";

export function SourceValidationPanel({ validation }: { validation: NotebookSourceValidation }) {
  const notebookChecksValid = validation.notebookIssueCount + validation.modelIssueCount === 0;

  return (
    <section className="notebook-source-validation-panel" aria-label="Notebook source validation">
      <div className="notebook-source-validation-grid">
        <ValidationStepBadge label="Parse" step={validation.parse} />
        <ValidationStepBadge label="Schema" step={validation.schema} />
        <div className={`notebook-source-validation-step${notebookChecksValid ? " is-valid" : " is-invalid"}`}>
          <span>Notebook checks</span>
          <strong>
            {notebookChecksValid
              ? "valid"
              : `${validation.notebookIssueCount + validation.modelIssueCount} issue${validation.notebookIssueCount + validation.modelIssueCount === 1 ? "" : "s"}`}
          </strong>
        </div>
      </div>

      {validation.issues.length > 0 ? (
        <ul className="notebook-source-validation-list">
          {validation.issues.slice(0, 5).map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      ) : (
        <div className="status-hint">Source is ready to apply.</div>
      )}
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
