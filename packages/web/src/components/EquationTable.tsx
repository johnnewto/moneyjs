import { useEffect, useState } from "react";

import type { EquationRow } from "../lib/editorModel";

interface EquationTableProps {
  equations: EquationRow[];
  issues: Record<string, string | undefined>;
  onChange(next: EquationRow[]): void;
}

export function EquationTable({ equations, issues, onChange }: EquationTableProps) {
  const [selectedEquationId, setSelectedEquationId] = useState<string>(equations[0]?.id ?? "");
  const [query, setQuery] = useState("");

  const filteredEquations = equations.filter((equation) => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return true;
    }
    return (
      equation.name.toLowerCase().includes(normalizedQuery) ||
      equation.expression.toLowerCase().includes(normalizedQuery)
    );
  });

  useEffect(() => {
    if (equations.length === 0) {
      setSelectedEquationId("");
      return;
    }

    const selectedStillExists = equations.some((equation) => equation.id === selectedEquationId);
    if (!selectedStillExists) {
      setSelectedEquationId(equations[0]?.id ?? "");
    }
  }, [equations, selectedEquationId]);

  useEffect(() => {
    if (filteredEquations.length === 0) {
      return;
    }

    const selectedStillVisible = filteredEquations.some(
      (equation) => equation.id === selectedEquationId
    );
    if (!selectedStillVisible) {
      setSelectedEquationId(filteredEquations[0]?.id ?? "");
    }
  }, [filteredEquations, selectedEquationId]);

  const selectedEquation = equations.find((equation) => equation.id === selectedEquationId) ?? null;
  const selectedIndex = selectedEquation
    ? equations.findIndex((equation) => equation.id === selectedEquation.id)
    : -1;
  const invalidEquationCount = equations.filter(
    (_, index) =>
      issues[`equations.${index}.name`] != null || issues[`equations.${index}.expression`] != null
  ).length;

  function handleAddEquation(): void {
    const nextEquation = newEquationRow();
    onChange([...equations, nextEquation]);
    setSelectedEquationId(nextEquation.id);
    setQuery("");
  }

  return (
    <section className="editor-panel equation-workspace">
      <div className="panel-header">
        <div>
          <h2>Equations</h2>
          <p className="panel-subtitle">
            Browse variables on the left and edit the selected equation in place.
          </p>
        </div>
        <button type="button" onClick={handleAddEquation}>
          Add equation
        </button>
      </div>

      <div className="equation-workspace-body">
        <aside className="equation-sidebar">
          <label className="field">
            <span>Filter equations</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by variable or formula"
            />
          </label>

          <div className="equation-sidebar-meta">
            <span>{equations.length} total</span>
            <span>{invalidEquationCount} flagged</span>
          </div>

          <div className="equation-list" role="list" aria-label="Equation list">
            {filteredEquations.map((equation, index) => {
              const actualIndex = equations.findIndex((entry) => entry.id === equation.id);
              const hasIssue =
                issues[`equations.${actualIndex}.name`] != null ||
                issues[`equations.${actualIndex}.expression`] != null;

              return (
                <button
                  key={equation.id}
                  type="button"
                  className={`equation-list-item${
                    equation.id === selectedEquationId ? " is-selected" : ""
                  }${hasIssue ? " has-issue" : ""}`}
                  onClick={() => setSelectedEquationId(equation.id)}
                >
                  <span className="equation-list-name">{equation.name || `Equation ${index + 1}`}</span>
                  <span className="equation-list-expression">
                    {equation.expression || "No expression yet"}
                  </span>
                </button>
              );
            })}

            {filteredEquations.length === 0 ? (
              <div className="equation-empty-state">No equations match the current filter.</div>
            ) : null}
          </div>
        </aside>

        <div className="equation-detail">
          {selectedEquation && selectedIndex >= 0 ? (
            <>
              <div className="equation-detail-header">
                <div>
                  <div className="eyebrow">Equation {selectedIndex + 1}</div>
                  <h3>{selectedEquation.name || "Unnamed equation"}</h3>
                </div>
                <button type="button" onClick={() => onChange(removeRow(equations, selectedIndex))}>
                  Remove
                </button>
              </div>

              <div className="equation-detail-grid">
                <label className="field">
                  <span>Variable</span>
                  <input
                    className={issues[`equations.${selectedIndex}.name`] ? "input-error" : ""}
                    value={selectedEquation.name}
                    onChange={(event) =>
                      updateRow(
                        equations,
                        selectedIndex,
                        { name: event.target.value },
                        onChange
                      )
                    }
                    placeholder="Y"
                  />
                </label>

                <label className="field equation-expression-field">
                  <span>Expression</span>
                  <textarea
                    className={issues[`equations.${selectedIndex}.expression`] ? "input-error" : ""}
                    value={selectedEquation.expression}
                    onChange={(event) =>
                      updateRow(
                        equations,
                        selectedIndex,
                        { expression: event.target.value },
                        onChange
                      )
                    }
                    placeholder="Cs + Gs"
                  />
                </label>
              </div>

              {issues[`equations.${selectedIndex}.name`] ||
              issues[`equations.${selectedIndex}.expression`] ? (
                <div className="field-error">
                  {issues[`equations.${selectedIndex}.name`] ??
                    issues[`equations.${selectedIndex}.expression`]}
                </div>
              ) : null}
            </>
          ) : (
            <div className="equation-empty-state">Add an equation to start building the model.</div>
          )}
        </div>
      </div>
    </section>
  );
}

function newEquationRow(): EquationRow {
  return {
    id: `eq-${crypto.randomUUID()}`,
    name: "",
    expression: ""
  };
}

function updateRow(
  rows: EquationRow[],
  index: number,
  patch: Partial<EquationRow>,
  onChange: (next: EquationRow[]) => void
): void {
  onChange(rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
}

function removeRow<T>(rows: T[], index: number): T[] {
  return rows.filter((_, rowIndex) => rowIndex !== index);
}
