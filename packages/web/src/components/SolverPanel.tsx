import type { EditorOptions } from "../lib/editorModel";

interface SolverPanelProps {
  options: EditorOptions;
  issues: Record<string, string | undefined>;
  onChange(next: EditorOptions): void;
}

export function SolverPanel({ options, issues, onChange }: SolverPanelProps) {
  return (
    <section className="editor-panel">
      <div className="panel-header">
        <h2>Solver options</h2>
      </div>

      <div className="option-grid">
        <label className="field">
          <span>Periods</span>
          <input
            className={issues["options.periods"] ? "input-error" : ""}
            type="number"
            value={options.periods}
            onChange={(event) => onChange({ ...options, periods: Number(event.target.value) })}
          />
        </label>

        <label className="field">
          <span>Solver</span>
          <select
            value={options.solverMethod}
            onChange={(event) =>
              onChange({
                ...options,
                solverMethod: event.target.value as EditorOptions["solverMethod"]
              })
            }
          >
            <option value="GAUSS_SEIDEL">Gauss-Seidel</option>
            <option value="NEWTON">Newton</option>
            <option value="BROYDEN">Broyden</option>
          </select>
        </label>

        <label className="field">
          <span>Tolerance</span>
          <input
            className={issues["options.toleranceText"] ? "input-error" : ""}
            value={options.toleranceText}
            onChange={(event) => onChange({ ...options, toleranceText: event.target.value })}
          />
        </label>

        <label className="field">
          <span>Max iterations</span>
          <input
            className={issues["options.maxIterations"] ? "input-error" : ""}
            type="number"
            value={options.maxIterations}
            onChange={(event) =>
              onChange({ ...options, maxIterations: Number(event.target.value) })
            }
          />
        </label>

        <label className="field">
          <span>Default initial value</span>
          <input
            className={issues["options.defaultInitialValueText"] ? "input-error" : ""}
            value={options.defaultInitialValueText}
            onChange={(event) =>
              onChange({ ...options, defaultInitialValueText: event.target.value })
            }
          />
        </label>

        <label className="field">
          <span>Hidden left variable</span>
          <input
            className={issues["options.hiddenEquation"] ? "input-error" : ""}
            value={options.hiddenLeftVariable}
            onChange={(event) =>
              onChange({ ...options, hiddenLeftVariable: event.target.value })
            }
          />
        </label>

        <label className="field">
          <span>Hidden right variable</span>
          <input
            className={issues["options.hiddenEquation"] ? "input-error" : ""}
            value={options.hiddenRightVariable}
            onChange={(event) =>
              onChange({ ...options, hiddenRightVariable: event.target.value })
            }
          />
        </label>

        <label className="field">
          <span>Hidden tolerance</span>
          <input
            className={issues["options.hiddenToleranceText"] ? "input-error" : ""}
            value={options.hiddenToleranceText}
            onChange={(event) =>
              onChange({ ...options, hiddenToleranceText: event.target.value })
            }
          />
        </label>

        <label className="checkbox-field">
          <input
            checked={options.relativeHiddenTolerance}
            type="checkbox"
            onChange={(event) =>
              onChange({ ...options, relativeHiddenTolerance: event.target.checked })
            }
          />
          <span>Use relative hidden tolerance</span>
        </label>
      </div>

      {[
        issues["options.periods"],
        issues["options.maxIterations"],
        issues["options.toleranceText"],
        issues["options.defaultInitialValueText"],
        issues["options.hiddenEquation"],
        issues["options.hiddenToleranceText"]
      ]
        .filter(Boolean)
        .map((message) => (
          <div key={message} className="field-error">
            {message}
          </div>
        ))}
    </section>
  );
}
