import type { EditorScenario, ShockRow, ShockVariableRow } from "../lib/editorModel";

interface ScenarioEditorProps {
  scenario: EditorScenario;
  issues: Record<string, string | undefined>;
  onChange(next: EditorScenario): void;
}

export function ScenarioEditor({ scenario, issues, onChange }: ScenarioEditorProps) {
  return (
    <section className="editor-panel">
      <div className="panel-header">
        <h2>Scenario shocks</h2>
        <button
          type="button"
          onClick={() => onChange({ shocks: [...scenario.shocks, newShockRow()] })}
        >
          Add shock
        </button>
      </div>

      <div className="editor-grid">
        {scenario.shocks.map((shock, shockIndex) => (
          <div className="shock-card" key={shock.id}>
            <div className="editor-row">
              <input
                className={
                  issues[`scenario.shocks.${shockIndex}.startPeriodInclusive`] ? "input-error" : ""
                }
                type="number"
                value={shock.startPeriodInclusive}
                onChange={(event) =>
                  updateShock(
                    scenario,
                    shockIndex,
                    { startPeriodInclusive: Number(event.target.value) },
                    onChange
                  )
                }
                placeholder="Start period"
              />
              <input
                className={
                  issues[`scenario.shocks.${shockIndex}.endPeriodInclusive`] ? "input-error" : ""
                }
                type="number"
                value={shock.endPeriodInclusive}
                onChange={(event) =>
                  updateShock(
                    scenario,
                    shockIndex,
                    { endPeriodInclusive: Number(event.target.value) },
                    onChange
                  )
                }
                placeholder="End period"
              />
              <button
                type="button"
                onClick={() =>
                  updateShock(
                    scenario,
                    shockIndex,
                    { variables: [...shock.variables, newShockVariableRow()] },
                    onChange
                  )
                }
              >
                Add variable
              </button>
              <button
                type="button"
                onClick={() =>
                  onChange({
                    shocks: scenario.shocks.filter((_, index) => index !== shockIndex)
                  })
                }
              >
                Remove shock
              </button>
            </div>

            {shock.variables.map((variable, variableIndex) => (
              <div className="editor-row" key={variable.id}>
                <input
                  className={
                    issues[`scenario.shocks.${shockIndex}.variables.${variableIndex}.name`]
                      ? "input-error"
                      : ""
                  }
                  value={variable.name}
                  onChange={(event) =>
                    updateShockVariable(
                      scenario,
                      shockIndex,
                      variableIndex,
                      { name: event.target.value },
                      onChange
                    )
                  }
                  placeholder="Variable"
                />
                <select
                  value={variable.kind}
                  onChange={(event) =>
                    updateShockVariable(
                      scenario,
                      shockIndex,
                      variableIndex,
                      { kind: event.target.value as ShockVariableRow["kind"] },
                      onChange
                    )
                  }
                >
                  <option value="constant">Constant</option>
                  <option value="series">Series</option>
                </select>
                <input
                  className={
                    issues[`scenario.shocks.${shockIndex}.variables.${variableIndex}.valueText`]
                      ? "input-error"
                      : ""
                  }
                  value={variable.valueText}
                  onChange={(event) =>
                    updateShockVariable(
                      scenario,
                      shockIndex,
                      variableIndex,
                      { valueText: event.target.value },
                      onChange
                    )
                  }
                  placeholder="30 or 30, 31"
                />
                <button
                  type="button"
                  onClick={() =>
                    updateShock(
                      scenario,
                      shockIndex,
                      {
                        variables: shock.variables.filter((_, index) => index !== variableIndex)
                      },
                      onChange
                    )
                  }
                >
                  Remove
                </button>
                {issues[`scenario.shocks.${shockIndex}.variables.${variableIndex}.name`] ||
                issues[`scenario.shocks.${shockIndex}.variables.${variableIndex}.valueText`] ? (
                  <div className="field-error">
                    {issues[`scenario.shocks.${shockIndex}.variables.${variableIndex}.name`] ??
                      issues[`scenario.shocks.${shockIndex}.variables.${variableIndex}.valueText`]}
                  </div>
                ) : null}
              </div>
            ))}
            {issues[`scenario.shocks.${shockIndex}.startPeriodInclusive`] ||
            issues[`scenario.shocks.${shockIndex}.endPeriodInclusive`] ? (
              <div className="field-error">
                {issues[`scenario.shocks.${shockIndex}.startPeriodInclusive`] ??
                  issues[`scenario.shocks.${shockIndex}.endPeriodInclusive`]}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function newShockRow(): ShockRow {
  return {
    id: `shock-${crypto.randomUUID()}`,
    startPeriodInclusive: 1,
    endPeriodInclusive: 1,
    variables: []
  };
}

function newShockVariableRow(): ShockVariableRow {
  return {
    id: `shock-var-${crypto.randomUUID()}`,
    name: "",
    kind: "constant",
    valueText: ""
  };
}

function updateShock(
  scenario: EditorScenario,
  shockIndex: number,
  patch: Partial<ShockRow>,
  onChange: (next: EditorScenario) => void
): void {
  onChange({
    shocks: scenario.shocks.map((shock, index) =>
      index === shockIndex ? { ...shock, ...patch } : shock
    )
  });
}

function updateShockVariable(
  scenario: EditorScenario,
  shockIndex: number,
  variableIndex: number,
  patch: Partial<ShockVariableRow>,
  onChange: (next: EditorScenario) => void
): void {
  onChange({
    shocks: scenario.shocks.map((shock, index) =>
      index === shockIndex
        ? {
            ...shock,
            variables: shock.variables.map((variable, currentVariableIndex) =>
              currentVariableIndex === variableIndex ? { ...variable, ...patch } : variable
            )
          }
        : shock
    )
  });
}
