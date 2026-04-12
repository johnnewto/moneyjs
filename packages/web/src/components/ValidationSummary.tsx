import type { ValidationIssue } from "../lib/editorModel";

interface ValidationSummaryProps {
  issues: ValidationIssue[];
}

export function ValidationSummary({ issues }: ValidationSummaryProps) {
  if (issues.length === 0) {
    return (
      <section className="status-panel">
        <div className="success-text">Editor validation: no field issues detected.</div>
      </section>
    );
  }

  return (
    <section className="status-panel">
      <div className="error-text">Editor validation: {issues.length} issue(s).</div>
      <ul className="validation-list">
        {issues.slice(0, 8).map((issue, index) => (
          <li key={`${issue.path}-${index}`}>{issue.message}</li>
        ))}
      </ul>
    </section>
  );
}
