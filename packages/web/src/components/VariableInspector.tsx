import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type { EquationRow } from "../lib/editorModel";
import type { VariableInspectorData } from "../lib/variableInspector";
import type { VariableDescriptions } from "../lib/variableDescriptions";
import type { VariableUnitMetadata } from "../lib/unitMeta";
import { HighlightedFormulaInput, highlightFormula } from "./EquationGridEditor";
import { VariableLabel } from "./VariableLabel";

interface VariableInspectorProps {
  canEditDefiningEquation?: boolean;
  commitStyle?: "draft" | "immediate";
  currentValues?: Record<string, number | undefined>;
  data: VariableInspectorData | null;
  onApplyDefiningExpression?: (expression: string) => void;
  onEditingChange?: (isEditing: boolean) => void;
  onSelectVariable(variableName: string): void;
  parameterNames?: string[];
  variableDescriptions?: VariableDescriptions;
  variableUnitMetadata?: VariableUnitMetadata;
}

export function VariableInspector({
  canEditDefiningEquation = false,
  commitStyle = "draft",
  currentValues,
  data,
  onApplyDefiningExpression,
  onEditingChange,
  onSelectVariable,
  parameterNames = [],
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
              <InspectorDefiningEquation
                canEdit={canEditDefiningEquation}
                commitStyle={commitStyle}
                currentValues={currentValues}
                definingEquation={data.definingEquation}
                generatedEquationExplanation={data.generatedEquationExplanation}
                onApplyExpression={onApplyDefiningExpression}
                onEditingChange={onEditingChange}
                parameterNames={parameterNames}
                variableDescriptions={variableDescriptions}
                variableUnitMetadata={variableUnitMetadata}
              />
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
                      <InspectorRelatedEquationLhs
                        currentValues={currentValues}
                        name={entry.equation.name}
                        onSelectVariable={onSelectVariable}
                        parameterNames={data.parameterNames}
                        traceRole={entry.tokenRoles.get(entry.equation.name.trim())}
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

function InspectorDefiningEquation({
  canEdit,
  commitStyle,
  currentValues,
  definingEquation,
  generatedEquationExplanation,
  onApplyExpression,
  onEditingChange,
  parameterNames,
  variableDescriptions,
  variableUnitMetadata
}: {
  canEdit: boolean;
  commitStyle: "draft" | "immediate";
  currentValues?: Record<string, number | undefined>;
  definingEquation: EquationRow;
  generatedEquationExplanation: string | null;
  onApplyExpression?: (expression: string) => void;
  onEditingChange?: (isEditing: boolean) => void;
  parameterNames: string[];
  variableDescriptions?: VariableDescriptions;
  variableUnitMetadata?: VariableUnitMetadata;
}) {
  const expressionInputRef = useRef<HTMLTextAreaElement | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [draftExpression, setDraftExpression] = useState(definingEquation.expression);
  const parameterNameSet = useMemo(() => new Set(parameterNames), [parameterNames]);
  const hasDraftChanges = draftExpression !== definingEquation.expression;

  useEffect(() => {
    setIsEditing(false);
    setDraftExpression(definingEquation.expression);
  }, [definingEquation.id, definingEquation.expression]);

  useEffect(() => {
    onEditingChange?.(isEditing);
  }, [isEditing, onEditingChange]);

  useEffect(() => {
    if (!isEditing) {
      return;
    }

    expressionInputRef.current?.focus();
  }, [isEditing]);

  function beginEditing(): void {
    if (!canEdit) {
      return;
    }

    setDraftExpression(definingEquation.expression);
    setIsEditing(true);
  }

  function cancelEditing(): void {
    setDraftExpression(definingEquation.expression);
    setIsEditing(false);
  }

  function commitExpression(): void {
    const trimmed = draftExpression.trim();
    if (!trimmed) {
      return;
    }

    onApplyExpression?.(trimmed);
    if (commitStyle === "draft") {
      setIsEditing(false);
    }
  }

  const editControls = canEdit ? (
    <div className="inspector-equation-edit-controls">
      <label className="inspector-equation-edit-toggle">
        <input
          checked={isEditing}
          onChange={(event) => {
            if (event.target.checked) {
              beginEditing();
            } else {
              cancelEditing();
            }
          }}
          type="checkbox"
        />
        <span>Edit expression</span>
      </label>
    </div>
  ) : null;

  return (
    <>
      {editControls}
      {isEditing ? (
        <div className="inspector-equation-editor">
          <div className="inspector-equation-editor-lhs">
            <VariableLabel
              currentValues={currentValues}
              name={definingEquation.name}
              variableDescriptions={variableDescriptions}
              variableUnitMetadata={variableUnitMetadata}
            />
            <span aria-hidden="true"> =</span>
          </div>
          <HighlightedFormulaInput
            ariaLabel={`Expression for ${definingEquation.name.trim()}`}
            className="inspector-equation-formula-input"
            currentValues={currentValues}
            inputRef={(node) => {
              expressionInputRef.current = node;
            }}
            onChange={setDraftExpression}
            onBlur={() => {
              if (commitStyle === "immediate" && hasDraftChanges) {
                commitExpression();
              }
            }}
            onEnter={() => {
              if (commitStyle === "immediate") {
                commitExpression();
              }
            }}
            parameterNames={parameterNameSet}
            placeholder="Expression"
            value={draftExpression}
            variableDescriptions={variableDescriptions}
            variableUnitMetadata={variableUnitMetadata}
          />
          {commitStyle === "draft" ? (
            <div className="inspector-equation-editor-actions">
              <button
                disabled={!hasDraftChanges || !draftExpression.trim()}
                onClick={commitExpression}
                type="button"
              >
                Apply
              </button>
              <button className="secondary-button" onClick={cancelEditing} type="button">
                Cancel
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <>
          <code
            className={`inspector-equation inspector-equation-display${canEdit ? " is-editable" : ""}`.trim()}
            onDoubleClick={beginEditing}
            title={canEdit ? "Double-click expression to edit" : undefined}
          >
            <VariableLabel
              currentValues={currentValues}
              name={definingEquation.name}
              variableDescriptions={variableDescriptions}
              variableUnitMetadata={variableUnitMetadata}
            />
            {" = "}
            {highlightFormula(
              definingEquation.expression,
              parameterNameSet,
              undefined,
              variableDescriptions,
              variableUnitMetadata,
              undefined,
              undefined,
              currentValues
            )}
          </code>
          {canEdit ? (
            <p className="inspector-helper">
              Double-click the expression to edit, or check Edit expression.
            </p>
          ) : null}
        </>
      )}
      {generatedEquationExplanation ? (
        <div className="inspector-generated-explanation">
          <div className="inspector-chip-label">Generated explanation</div>
          <p>{generatedEquationExplanation}</p>
        </div>
      ) : null}
    </>
  );
}

type InspectorTraceRole = "root" | "input" | "output" | "both";

function InspectorRelatedEquationLhs({
  currentValues,
  name,
  onSelectVariable,
  parameterNames,
  traceRole,
  variableDescriptions,
  variableUnitMetadata
}: {
  currentValues?: Record<string, number | undefined>;
  name: string;
  onSelectVariable(variableName: string): void;
  parameterNames: string[];
  traceRole?: InspectorTraceRole;
  variableDescriptions?: VariableDescriptions;
  variableUnitMetadata?: VariableUnitMetadata;
}) {
  const normalizedName = name.trim();
  const parameterNameSet = new Set(parameterNames);
  const tokenClass = parameterNameSet.has(normalizedName)
    ? "formula-parameter"
    : /^[A-Z]/.test(normalizedName)
      ? "formula-uppercase"
      : /^[a-z]/.test(normalizedName)
        ? "formula-lowercase"
        : "formula-default";
  const className = [
    "result-variable-button",
    "inspector-equation-lhs",
    "formula-token",
    tokenClass,
    traceRole ? `trace-token-${traceRole}` : "",
    "is-clickable"
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      aria-label={`Inspect variable ${normalizedName}`}
      className={className}
      onClick={() => onSelectVariable(normalizedName)}
    >
      <VariableLabel
        currentValues={currentValues}
        name={name}
        variableDescriptions={variableDescriptions}
        variableUnitMetadata={variableUnitMetadata}
      />
    </button>
  );
}

function formatRelatedEquationRole(role: InspectorTraceRole): string {
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
