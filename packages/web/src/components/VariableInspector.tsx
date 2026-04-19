import type { ReactNode } from "react";

import type { VariableInspectorData } from "../lib/variableInspector";
import type { VariableDescriptions } from "../lib/variableDescriptions";
import type { VariableUnitMetadata } from "../lib/unitMeta";
import { highlightFormula } from "./EquationGridEditor";
import { VariableLabel } from "./VariableLabel";

interface VariableInspectorProps {
  currentValues?: Record<string, number | undefined>;
  data: VariableInspectorData | null;
  onSelectVariable(variableName: string): void;
  variableDescriptions?: VariableDescriptions;
  variableUnitMetadata?: VariableUnitMetadata;
}

export function VariableInspector({
  currentValues,
  data,
  onSelectVariable,
  variableDescriptions,
  variableUnitMetadata
}: VariableInspectorProps) {
  return (
    <section className="control-panel variable-inspector-panel">
      {data ? (
        <div className="variable-inspector-body">
          <div className="variable-inspector-hero">
            <div>
              <div className="eyebrow">Selected variable</div>
              <h3>
                <VariableLabel
                  currentValues={currentValues}
                  name={data.name}
                  variableDescriptions={variableDescriptions}
                  variableUnitMetadata={variableUnitMetadata}
                />
              </h3>
            </div>
            <div className="variable-inspector-badges">
              <span className="inspector-badge">{data.roleLabel}</span>
              {data.isStockFlowLabel ? (
                <span className="inspector-badge is-muted">{data.isStockFlowLabel}</span>
              ) : null}
              {data.unitLabel ? <span className="inspector-badge is-muted">{data.unitLabel}</span> : null}
            </div>
          </div>

          <InspectorSection title={data.description?.trim() || "Equation"}>
            {data.definingEquation ? (
              <>
                <code className="inspector-equation">
                  <VariableLabel
                    currentValues={currentValues}
                    name={data.definingEquation.name}
                    variableDescriptions={variableDescriptions}
                    variableUnitMetadata={variableUnitMetadata}
                  />
                  {" = "}
                  {highlightFormula(
                    data.definingEquation.expression,
                    new Set<string>(),
                    undefined,
                    variableDescriptions,
                    variableUnitMetadata,
                    undefined,
                    undefined,
                    currentValues
                  )}
                </code>
                {data.generatedEquationExplanation ? (
                  <div className="inspector-generated-explanation">
                    <div className="inspector-chip-label">Generated explanation</div>
                    <p>{data.generatedEquationExplanation}</p>
                  </div>
                ) : null}
              </>
            ) : data.externalDefinition ? (
              <p>
                Defined externally as a <strong>{data.externalDefinition.kind}</strong> input.
              </p>
            ) : (
              <p>No defining equation is available for this variable.</p>
            )}
          </InspectorSection>

          <InspectorSection title="Flows Affecting It">
            <div className="inspector-chip-grid">
              <VariableChipList
                currentValues={currentValues}
                emptyLabel="No direct current-period drivers detected."
                label="Current-period drivers"
                variableDescriptions={variableDescriptions}
                variableUnitMetadata={variableUnitMetadata}
                values={data.equationInputs.current}
                onSelectVariable={onSelectVariable}
              />
              <VariableChipList
                currentValues={currentValues}
                emptyLabel="No lagged drivers detected."
                label="Lagged drivers"
                variableDescriptions={variableDescriptions}
                variableUnitMetadata={variableUnitMetadata}
                values={data.equationInputs.lagged}
                onSelectVariable={onSelectVariable}
              />
            </div>
          </InspectorSection>

          <InspectorSection title="Directly Affects">
            <div className="inspector-chip-grid">
              <VariableChipList
                currentValues={currentValues}
                emptyLabel="No downstream equations reference this variable yet."
                label="Downstream variables"
                variableDescriptions={variableDescriptions}
                variableUnitMetadata={variableUnitMetadata}
                values={data.affects}
                onSelectVariable={onSelectVariable}
              />
              <StaticChipList
                emptyLabel="No accounting matrix terms reference this variable yet."
                label="Accounting terms"
                values={data.affectsAccountingTerms}
              />
            </div>
          </InspectorSection>

          <InspectorSection title="Affected equations">
            {data.relatedEquations.length > 0 ? (
              <div className="inspector-related-equation-list">
                {data.relatedEquations.map((entry) => (
                  <article
                    key={entry.equation.id}
                    className={`inspector-related-equation trace-${entry.role}`}
                  >
                    <div className="inspector-related-equation-meta">
                      <button
                        type="button"
                        aria-label={`Inspect variable ${entry.equation.name.trim()}`}
                        className="result-variable-button inspector-related-equation-title"
                        onClick={() => onSelectVariable(entry.equation.name.trim())}
                      >
                        <span className="inspector-related-equation-title-name">
                          <VariableLabel
                            currentValues={currentValues}
                            name={entry.equation.name}
                            variableDescriptions={variableDescriptions}
                            variableUnitMetadata={variableUnitMetadata}
                          />
                        </span>
                        <span className="inspector-related-equation-title-separator" aria-hidden="true">
                          |
                        </span>
                        <span className="inspector-related-equation-title-description">
                          {getRelatedEquationTitleDescription(entry.equation.name.trim(), entry.equation.desc, variableDescriptions)}
                        </span>
                        <span className="inspector-related-equation-title-separator" aria-hidden="true">
                          |
                        </span>
                        <span className="inspector-related-equation-title-role">
                          {formatRelatedEquationRole(entry.role)}
                        </span>
                      </button>
                    </div>
                    <code className="inspector-equation">
                      <VariableLabel
                        currentValues={currentValues}
                        name={entry.equation.name}
                        variableDescriptions={variableDescriptions}
                        variableUnitMetadata={variableUnitMetadata}
                      />
                      {" = "}
                      {highlightFormula(
                        entry.equation.expression,
                        new Set(data.parameterNames),
                        entry.tokenRoles,
                        variableDescriptions,
                        variableUnitMetadata,
                        onSelectVariable,
                        undefined,
                        currentValues
                      )}
                    </code>
                  </article>
                ))}
              </div>
            ) : (
              <div className="inspector-empty-note">
                No related equations are available for this variable yet.
              </div>
            )}
          </InspectorSection>

          {data.equationRoleLabel ? (
            <InspectorSection title="Equation metadata">
              <dl className="inspector-facts">
                <div>
                  <dt>Equation role</dt>
                  <dd>{data.equationRoleLabel}</dd>
                </div>
                <div>
                  <dt>Role source</dt>
                  <dd>{data.equationRoleSourceLabel ?? "Unknown"}</dd>
                </div>
              </dl>
            </InspectorSection>
          ) : null}
        </div>
      ) : (
        <div className="variable-inspector-empty">
          Select a variable to inspect it here.
        </div>
      )}
    </section>
  );
}

function formatRelatedEquationRole(role: "root" | "input" | "output" | "both"): string {
  switch (role) {
    case "root":
      return "Defining";
    case "input":
      return "Upstream";
    case "output":
      return "Downstream";
    case "both":
      return "Both";
  }
}

function getRelatedEquationTitleDescription(
  variableName: string,
  equationDescription: string | undefined,
  variableDescriptions?: VariableDescriptions
): string {
  return (
    variableDescriptions?.get(variableName)?.trim() ||
    equationDescription?.trim() ||
    "No description"
  );
}

function StaticChipList({
  emptyLabel,
  label,
  values
}: {
  emptyLabel: string;
  label: string;
  values: string[];
}) {
  return (
    <div className="inspector-chip-group">
      <div className="inspector-chip-label">{label}</div>
      {values.length > 0 ? (
        <div className="inspector-chip-list">
          {values.map((value) => (
            <span key={value} className="inspector-chip">
              {value}
            </span>
          ))}
        </div>
      ) : (
        <div className="inspector-empty-note">{emptyLabel}</div>
      )}
    </div>
  );
}

function InspectorSection({
  children,
  title
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <section className="inspector-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function VariableChipList({
  currentValues,
  emptyLabel,
  label,
  onSelectVariable,
  variableDescriptions,
  variableUnitMetadata,
  values
}: {
  currentValues?: Record<string, number | undefined>;
  emptyLabel: string;
  label: string;
  onSelectVariable(variableName: string): void;
  variableDescriptions?: VariableDescriptions;
  variableUnitMetadata?: VariableUnitMetadata;
  values: string[];
}) {
  return (
    <div className="inspector-chip-group">
      <div className="inspector-chip-label">{label}</div>
      {values.length > 0 ? (
        <div className="inspector-chip-list">
          {values.map((value) => (
            <button
              key={value}
              type="button"
              aria-label={`Inspect variable ${value}`}
              className="inspector-chip"
              onClick={() => onSelectVariable(value)}
            >
              <VariableLabel
                currentValues={currentValues}
                name={value}
                variableDescriptions={variableDescriptions}
                variableUnitMetadata={variableUnitMetadata}
              />
            </button>
          ))}
        </div>
      ) : (
        <div className="inspector-empty-note">{emptyLabel}</div>
      )}
    </div>
  );
}
