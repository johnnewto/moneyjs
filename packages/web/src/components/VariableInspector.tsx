import type { ReactNode } from "react";

import type { VariableInspectorData } from "../lib/variableInspector";
import type { VariableDescriptions } from "../lib/variableDescriptions";
import type { VariableUnitMetadata } from "../lib/unitMeta";
import { highlightFormula } from "./EquationGridEditor";
import { VariableLabel } from "./VariableLabel";

interface VariableInspectorProps {
  data: VariableInspectorData | null;
  onSelectVariable(variableName: string): void;
  variableDescriptions?: VariableDescriptions;
  variableUnitMetadata?: VariableUnitMetadata;
}

export function VariableInspector({
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
                {data.equationRoleLabel ? (
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
                ) : null}
                <code className="inspector-equation">
                  <VariableLabel
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
                    variableUnitMetadata
                  )}
                </code>
                {data.generatedEquationExplanation ? (
                  <div className="inspector-generated-explanation">
                    <div className="inspector-chip-label">Generated explanation</div>
                    <p>{data.generatedEquationExplanation}</p>
                  </div>
                ) : null}
                <p className="inspector-helper">
                  {data.definingEquation.desc?.trim() || "No equation note has been entered."}
                </p>
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
            <VariableChipList
              emptyLabel="No direct current-period drivers detected."
              label="Current-period drivers"
              variableDescriptions={variableDescriptions}
              variableUnitMetadata={variableUnitMetadata}
              values={data.equationInputs.current}
              onSelectVariable={onSelectVariable}
            />
            <VariableChipList
              emptyLabel="No lagged drivers detected."
              label="Lagged drivers"
              variableDescriptions={variableDescriptions}
              variableUnitMetadata={variableUnitMetadata}
              values={data.equationInputs.lagged}
              onSelectVariable={onSelectVariable}
            />
          </InspectorSection>

          <InspectorSection title="Directly Affects">
            <VariableChipList
              emptyLabel="No downstream equations reference this variable yet."
              label="Downstream variables"
              variableDescriptions={variableDescriptions}
              variableUnitMetadata={variableUnitMetadata}
              values={data.affects}
              onSelectVariable={onSelectVariable}
            />
          </InspectorSection>
        </div>
      ) : (
        <div className="variable-inspector-empty">
          Select a variable to inspect it here.
        </div>
      )}
    </section>
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
  emptyLabel,
  label,
  onSelectVariable,
  variableDescriptions,
  variableUnitMetadata,
  values
}: {
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
              className="inspector-chip"
              onClick={() => onSelectVariable(value)}
            >
              <VariableLabel
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
