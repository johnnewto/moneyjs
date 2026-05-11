import type { ScenarioDefinition, ShockVariableDef } from "@sfcr/core";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { formatCellBody } from "./sourceEditing";
import type { NotebookCell, RunCell } from "./types";

type ScenarioShockDraft = ScenarioDefinition["shocks"][number] & {
  rangeInclusive?: [number, number];
};

type RunCellSourceDraft = Omit<RunCell, "scenario"> & {
  scenario?: { shocks: ScenarioShockDraft[] } | null;
};

interface ScenarioSourceEditorProps {
  value: string;
  onChange(next: string): void;
}

export function ScenarioSourceEditor({ value, onChange }: ScenarioSourceEditorProps) {
  const parsed = parseRunCellSource(value);

  if (!parsed) {
    return (
      <div className="scenario-source-editor scenario-source-editor-invalid" role="status">
        Scenario mode needs valid run-cell JSON. Switch to Pretty or Compact to repair the source.
      </div>
    );
  }

  const scenario = parsed.scenario ?? { shocks: [] };

  function commit(next: RunCellSourceDraft): void {
    onChange(formatCellBody(next, "compact"));
  }

  function updateCell(patch: Partial<RunCellSourceDraft>): void {
    commit({ ...parsed, ...patch } as RunCellSourceDraft);
  }

  function updateShock(shockIndex: number, patch: Partial<ScenarioShockDraft>): void {
    commit({
      ...parsed,
      scenario: {
        shocks: scenario.shocks.map((shock, index) =>
          index === shockIndex ? { ...shock, ...patch } : shock
        )
      }
    } as RunCellSourceDraft);
  }

  function updateShockVariable(
    shockIndex: number,
    variableName: string,
    nextName: string,
    nextValue: ShockVariableDef
  ): void {
    const trimmedName = nextName.trim();
    if (!trimmedName) {
      return;
    }

    const shock = scenario.shocks[shockIndex];
    if (!shock) {
      return;
    }

    const nextVariables = { ...shock.variables };
    delete nextVariables[variableName];
    nextVariables[trimmedName] = nextValue;
    updateShock(shockIndex, { variables: nextVariables });
  }

  return (
    <div className="scenario-source-editor">
      <div className="scenario-source-meta-grid" aria-label="Scenario run settings">
        <ScenarioField label="Mode">
          <select
            className="scenario-pill-input"
            aria-label="Scenario run mode"
            value={parsed.mode}
            onChange={(event) =>
              updateCell({ mode: event.target.value as RunCellSourceDraft["mode"] })
            }
          >
            <option value="baseline">baseline</option>
            <option value="scenario">scenario</option>
          </select>
        </ScenarioField>
        <ScenarioField label="Baseline">
          <input
            className="scenario-pill-input scenario-pill-input-mono"
            value={parsed.baselineRunCellId ?? ""}
            onChange={(event) => updateCell({ baselineRunCellId: event.target.value })}
            placeholder="baseline-run"
          />
        </ScenarioField>
        <ScenarioField label="Start period">
          <input
            className="scenario-pill-input scenario-pill-input-number"
            type="number"
            value={parsed.baselineStartPeriod ?? ""}
            onChange={(event) =>
              updateCell({
                baselineStartPeriod:
                  event.target.value === "" ? undefined : Number(event.target.value)
              })
            }
            placeholder="55"
          />
        </ScenarioField>
        <ScenarioField label="Periods">
          <input
            className="scenario-pill-input scenario-pill-input-number"
            type="number"
            value={parsed.periods ?? ""}
            onChange={(event) =>
              updateCell({ periods: event.target.value === "" ? undefined : Number(event.target.value) })
            }
            placeholder="100"
          />
        </ScenarioField>
      </div>

      <div className="scenario-source-actions">
        <button
          type="button"
          className="secondary-button"
          onClick={() =>
            updateCell({
              mode: "scenario",
              scenario: {
                shocks: [
                  ...scenario.shocks,
                  {
                    rangeInclusive: [1, 4],
                    variables: {
                      Gd: { kind: "constant", value: 25 }
                    }
                  } as unknown as ScenarioShockDraft
                ]
              }
            })
          }
        >
          Add shock
        </button>
      </div>

      <div className="scenario-source-shocks">
        {scenario.shocks.length === 0 ? (
          <div className="scenario-source-empty">No shocks defined.</div>
        ) : null}
        {scenario.shocks.map((shock, shockIndex) => {
          const [startPeriod, endPeriod] = getShockRange(shock);
          const variableEntries = Object.entries(shock.variables);
          return (
            <section className="scenario-source-shock" key={`shock-${shockIndex}`}>
              <div className="scenario-source-shock-header">
                <span>Shock {shockIndex + 1}</span>
                <div className="scenario-source-range" aria-label={`Shock ${shockIndex + 1} range`}>
                  <span>Start</span>
                  <input
                    className="scenario-pill-input scenario-pill-input-number"
                    type="number"
                    value={startPeriod}
                    onChange={(event) =>
                      updateShock(shockIndex, {
                        rangeInclusive: [Number(event.target.value), endPeriod]
                      })
                    }
                    aria-label={`Shock ${shockIndex + 1} start period`}
                  />
                  <span>:</span>
                  <span>Stop</span>
                  <input
                    className="scenario-pill-input scenario-pill-input-number"
                    type="number"
                    value={endPeriod}
                    onChange={(event) =>
                      updateShock(shockIndex, {
                        rangeInclusive: [startPeriod, Number(event.target.value)]
                      })
                    }
                    aria-label={`Shock ${shockIndex + 1} end period`}
                  />
                </div>
                <button
                  type="button"
                  className="scenario-source-remove"
                  onClick={() =>
                    updateCell({
                      scenario: {
                        shocks: scenario.shocks.filter((_, index) => index !== shockIndex)
                      }
                    })
                  }
                >
                  Remove
                </button>
              </div>

              <div className="scenario-source-variable-table">
                {variableEntries.map(([name, variable]) => (
                  <ScenarioVariableRow
                    key={name}
                    name={name}
                    variable={variable}
                    onChange={(nextName, nextValue) =>
                      updateShockVariable(shockIndex, name, nextName, nextValue)
                    }
                    onRemove={() => {
                      const nextVariables = { ...shock.variables };
                      delete nextVariables[name];
                      updateShock(shockIndex, { variables: nextVariables });
                    }}
                  />
                ))}
              </div>

              <button
                type="button"
                className="secondary-button scenario-source-add-variable"
                onClick={() => {
                  const nextName = nextVariableName(shock.variables);
                  updateShock(shockIndex, {
                    variables: {
                      ...shock.variables,
                      [nextName]: { kind: "constant", value: 0 }
                    }
                  });
                }}
              >
                Add variable
              </button>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function ScenarioField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="scenario-source-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function ScenarioVariableRow({
  name,
  variable,
  onChange,
  onRemove
}: {
  name: string;
  variable: ShockVariableDef;
  onChange(nextName: string, nextValue: ShockVariableDef): void;
  onRemove(): void;
}) {
  const valueText = variable.kind === "constant" ? String(variable.value) : variable.values.join(", ");
  const [valueDraft, setValueDraft] = useState(valueText);
  const [isValueFocused, setIsValueFocused] = useState(false);

  useEffect(() => {
    if (!isValueFocused) {
      setValueDraft(valueText);
    }
  }, [isValueFocused, valueText]);

  function updateKind(nextKind: ShockVariableDef["kind"]): void {
    if (nextKind === variable.kind) {
      return;
    }

    onChange(
      name,
      nextKind === "constant" ? { kind: "constant", value: 0 } : { kind: "series", values: [] }
    );
  }

  function updateValue(nextValueText: string): void {
    setValueDraft(nextValueText);

    if (variable.kind === "constant") {
      if (nextValueText.trim() === "") {
        return;
      }
      const nextValue = Number(nextValueText);
      if (Number.isFinite(nextValue)) {
        onChange(name, { kind: "constant", value: nextValue });
      }
      return;
    }

    const parts = nextValueText.split(",").map((item) => item.trim());
    if (parts.some((item) => item === "")) {
      return;
    }

    const values = parts.map((item) => Number(item));
    if (values.some((item) => !Number.isFinite(item))) {
      return;
    }
    onChange(name, { kind: "series", values });
  }

  return (
    <div className="scenario-source-variable-row">
      <input
        className="scenario-pill-input scenario-pill-input-mono"
        value={name}
        onChange={(event) => onChange(event.target.value, variable)}
        aria-label={`Shock variable ${name}`}
      />
      <select
        className="scenario-pill-input"
        value={variable.kind}
        onChange={(event) => updateKind(event.target.value as ShockVariableDef["kind"])}
        aria-label={`Value kind for ${name}`}
      >
        <option value="constant">constant</option>
        <option value="series">series</option>
      </select>
      <input
        className="scenario-pill-input scenario-pill-input-mono scenario-source-value-input"
        inputMode="decimal"
        value={valueDraft}
        onChange={(event) => updateValue(event.target.value)}
        onBlur={() => setIsValueFocused(false)}
        onFocus={() => setIsValueFocused(true)}
        aria-label={`Value for ${name}`}
      />
      <button type="button" className="scenario-source-remove" onClick={onRemove}>
        Remove
      </button>
    </div>
  );
}

function parseRunCellSource(source: string): RunCellSourceDraft | null {
  try {
    const parsed = JSON.parse(source) as NotebookCell;
    return parsed.type === "run" ? (parsed as RunCellSourceDraft) : null;
  } catch {
    return null;
  }
}

function getShockRange(shock: ScenarioShockDraft): [number, number] {
  return [
    shock.rangeInclusive?.[0] ?? shock.startPeriodInclusive ?? 1,
    shock.rangeInclusive?.[1] ?? shock.endPeriodInclusive ?? 1
  ];
}

function nextVariableName(variables: Record<string, ShockVariableDef>): string {
  let index = 1;
  let name = "variable";
  while (Object.prototype.hasOwnProperty.call(variables, name)) {
    index += 1;
    name = `variable${index}`;
  }
  return name;
}
