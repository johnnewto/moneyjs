import type { ExternalRow } from "../lib/editorModel";

interface ExternalEditorProps {
  currentValues?: Record<string, number | undefined>;
  externals: ExternalRow[];
  issues: Record<string, string | undefined>;
  onChange(next: ExternalRow[]): void;
}

export function ExternalEditor({
  currentValues = {},
  externals,
  issues,
  onChange
}: ExternalEditorProps) {
  return (
    <section className="editor-panel">
      <div className="panel-header">
        <div>
          <h2>Externals</h2>
          <p className="panel-subtitle">
            Parameters and exogenous series in the same compact ledger style as equations.
          </p>
        </div>
        <button type="button" onClick={() => onChange([...externals, newExternalRow()])}>
          Add external
        </button>
      </div>

      <div className="external-grid-shell">
        <div className="external-grid-header" role="row">
          <span>#</span>
          <span>Name</span>
          <span>Kind</span>
          <span>Value</span>
          <span>Current</span>
          <span>Status</span>
          <span />
        </div>

        <div className="external-grid-body">
        {externals.map((external, index) => (
          <div
            className={`external-grid-row${
              issues[`externals.${index}.name`] || issues[`externals.${index}.valueText`]
                ? " has-issue"
                : ""
            }`}
            key={external.id}
            role="row"
          >
            <span className="external-grid-index">{index + 1}</span>
            <input
              aria-label={`External ${index + 1} name`}
              className={issues[`externals.${index}.name`] ? "input-error" : ""}
              value={external.name}
              onChange={(event) =>
                updateRow(externals, index, { name: event.target.value }, onChange)
              }
              placeholder="alpha1"
            />
            <select
              aria-label={`External ${index + 1} kind`}
              value={external.kind}
              onChange={(event) =>
                updateRow(externals, index, {
                  kind: event.target.value as ExternalRow["kind"]
                }, onChange)
              }
            >
              <option value="constant">Constant</option>
              <option value="series">Series</option>
            </select>
            <input
              aria-label={`External ${index + 1} value`}
              className={issues[`externals.${index}.valueText`] ? "input-error" : ""}
              value={external.valueText}
              onChange={(event) =>
                updateRow(externals, index, { valueText: event.target.value }, onChange)
              }
              placeholder="20 or 20, 21, 22"
            />
            <span className="external-grid-current">
              {formatCurrentValue(external.name, currentValues[external.name.trim()])}
            </span>
            <span
              className={`external-grid-status${
                issues[`externals.${index}.name`] || issues[`externals.${index}.valueText`]
                  ? " has-issue"
                  : ""
              }`}
            >
              {issues[`externals.${index}.name`] ?? issues[`externals.${index}.valueText`] ?? "OK"}
            </span>
            <button type="button" onClick={() => onChange(removeRow(externals, index))}>
              Remove
            </button>
          </div>
        ))}

          {externals.length === 0 ? (
            <div className="external-grid-empty">Add an external to define a parameter or input series.</div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function newExternalRow(): ExternalRow {
  return {
    id: `ext-${crypto.randomUUID()}`,
    name: "",
    kind: "constant",
    valueText: ""
  };
}

function updateRow(
  rows: ExternalRow[],
  index: number,
  patch: Partial<ExternalRow>,
  onChange: (next: ExternalRow[]) => void
): void {
  onChange(rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
}

function removeRow<T>(rows: T[], index: number): T[] {
  return rows.filter((_, rowIndex) => rowIndex !== index);
}

function formatCurrentValue(name: string, value: number | undefined): string {
  const trimmedName = name.trim();
  if (!trimmedName) {
    return "";
  }
  if (!Number.isFinite(value)) {
    return `${trimmedName} = --`;
  }
  return `${trimmedName} = ${Number(value).toLocaleString(undefined, { maximumFractionDigits: 6 })}`;
}
