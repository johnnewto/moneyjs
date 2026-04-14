import type { InitialValueRow } from "../lib/editorModel";
import { formatNamedValueWithUnits, type VariableUnitMetadata } from "../lib/unitMeta";

interface InitialValuesEditorProps {
  currentValues?: Record<string, number | undefined>;
  isEmbedded?: boolean;
  initialValues: InitialValueRow[];
  issues: Record<string, string | undefined>;
  onChange(next: InitialValueRow[]): void;
  showHeading?: boolean;
  variableUnitMetadata?: VariableUnitMetadata;
}

export function InitialValuesEditor({
  currentValues = {},
  isEmbedded = false,
  initialValues,
  issues,
  onChange,
  showHeading = true,
  variableUnitMetadata
}: InitialValuesEditorProps) {
  return (
    <section className={isEmbedded ? "grid-editor-embedded" : "editor-panel"}>
      {showHeading ? (
        <div className="panel-header">
          <h2>Initial values</h2>
        </div>
      ) : null}

      <div className="initial-grid-shell">
        <div className="initial-grid-header" role="row">
          <span>#</span>
          <span>Name</span>
          <span>Initial</span>
          <span>Current</span>
          <span>Status</span>
          <span />
        </div>

        <div className="initial-grid-body">
        {initialValues.map((initialValue, index) => (
          <div
            className={`initial-grid-row${
              issues[`initialValues.${index}.name`] || issues[`initialValues.${index}.valueText`]
                ? " has-issue"
                : ""
            }`}
            key={initialValue.id}
            role="row"
          >
            <span className="initial-grid-index">{index + 1}</span>
            <input
              aria-label={`Initial ${index + 1} name`}
              className={issues[`initialValues.${index}.name`] ? "input-error" : ""}
              value={initialValue.name}
              onChange={(event) =>
                updateRow(initialValues, index, { name: event.target.value }, onChange)
              }
              placeholder="Hh"
            />
            <input
              aria-label={`Initial ${index + 1} value`}
              className={issues[`initialValues.${index}.valueText`] ? "input-error" : ""}
              value={initialValue.valueText}
              onChange={(event) =>
                updateRow(initialValues, index, { valueText: event.target.value }, onChange)
              }
              placeholder="Value"
            />
            <span className="initial-grid-current">
              {formatCurrentValue(
                initialValue.name,
                currentValues[initialValue.name.trim()],
                variableUnitMetadata
              )}
            </span>
            <span
              className={`initial-grid-status${
                issues[`initialValues.${index}.name`] || issues[`initialValues.${index}.valueText`]
                  ? " has-issue"
                  : ""
              }`}
            >
              {issues[`initialValues.${index}.name`] ?? issues[`initialValues.${index}.valueText`] ?? "OK"}
            </span>
            <button
              type="button"
              aria-label={`Remove initial ${index + 1}`}
              className="external-grid-remove-button"
              onClick={() => onChange(removeRow(initialValues, index))}
            >
              -
            </button>
          </div>
        ))}
        </div>
      </div>

      <div className="grid-editor-footer">
        <button type="button" onClick={() => onChange([...initialValues, newInitialValueRow()])}>
          Add initial
        </button>
      </div>
    </section>
  );
}

function newInitialValueRow(): InitialValueRow {
  return {
    id: `init-${crypto.randomUUID()}`,
    name: "",
    valueText: ""
  };
}

function updateRow(
  rows: InitialValueRow[],
  index: number,
  patch: Partial<InitialValueRow>,
  onChange: (next: InitialValueRow[]) => void
): void {
  onChange(rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
}

function removeRow<T>(rows: T[], index: number): T[] {
  return rows.filter((_, rowIndex) => rowIndex !== index);
}

function formatCurrentValue(
  name: string,
  value: number | undefined,
  variableUnitMetadata?: VariableUnitMetadata
): string {
  return formatNamedValueWithUnits(name, value, variableUnitMetadata?.get(name.trim()), {
    maximumFractionDigits: 6
  });
}
