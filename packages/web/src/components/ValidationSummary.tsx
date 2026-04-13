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

  const errorCount = issues.filter((issue) => (issue.severity ?? "error") === "error").length;
  const warningCount = issues.filter((issue) => issue.severity === "warning").length;

  return (
    <section className="status-panel">
      <div className="error-text">
        Editor validation: {errorCount} error(s), {warningCount} warning(s).
      </div>
      <ul className="validation-list">
        {issues.slice(0, 8).map((issue, index) => (
          <li key={`${issue.path}-${index}`}>
            {(issue.severity ?? "error") === "warning" ? "Warning: " : "Error: "}
            {issue.message}
          </li>
        ))}
      </ul>
    </section>
  );
}
