import { Fragment, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";

import type { EquationRow, ExternalRow } from "../lib/editorModel";
import {
  parseConstantBaselineValue,
  resolveEffectiveConstantValue,
  resolveModelOverrides,
  type ConstantExternalOverrides
} from "../lib/externalParameterControls";
import {
  isRelatedEquationInitiallyVisible,
  RELATED_EQUATIONS_INITIAL_UPSTREAM_DEPTH,
  type VariableInspectorData
} from "../lib/variableInspector";
import { collectEquationDenominatorVariables } from "../lib/equationDivisionAnalysis";
import type { VariableDescriptions } from "../lib/variableDescriptions";
import type { VariableUnitMetadata } from "../lib/unitMeta";
import { HighlightedFormulaInput, highlightFormula } from "./EquationGridEditor";
import { ParameterSliderControl } from "./ParameterSliderControl";
import { PinToggleIcon } from "./PinToggleIcon";
import { VariableLabel } from "./VariableLabel";
import { VariableInspectorSparkline } from "./VariableInspectorSparkline";
import {
  StabilityInspectorSection,
  type StabilitySummaryProps
} from "./StabilitySummary";

interface VariableInspectorProps {
  canEditDefiningEquation?: boolean;
  canGoBack?: boolean;
  canGoForward?: boolean;
  commitStyle?: "draft" | "immediate";
  currentValues?: Record<string, number | undefined>;
  laggedCurrentValues?: Record<string, number | undefined>;
  laggedPeriodLabel?: string;
  data: VariableInspectorData | null;
  isPinned?: boolean;
  onApplyDefiningExpression?: (expression: string) => void;
  onEditingChange?: (isEditing: boolean) => void;
  onGoBack?: () => void;
  onGoForward?: () => void;
  onTogglePin?: () => void;
  hasPendingParameterOverrides?: boolean;
  inspectorModelId?: string | null;
  onParameterOverrideChange?(modelId: string, name: string, value: number): void;
  onParameterOverrideRelease?(): void;
  onShowUsages?(): void;
  usagesCount?: number | null;
  onSelectVariable(variableName: string): void;
  variableOptions?: string[];
  parameterNames?: string[];
  parameterOverrides?: ConstantExternalOverrides;
  selectedPeriodIndex?: number;
  seriesValues?: number[];
  stability?: StabilitySummaryProps | null;
  variableDescriptions?: VariableDescriptions;
  variableUnitMetadata?: VariableUnitMetadata;
}

export function VariableInspector({
  canEditDefiningEquation = false,
  canGoBack = false,
  canGoForward = false,
  commitStyle = "draft",
  currentValues,
  laggedCurrentValues,
  laggedPeriodLabel,
  data,
  isPinned = false,
  onApplyDefiningExpression,
  onEditingChange,
  onGoBack,
  hasPendingParameterOverrides = false,
  inspectorModelId = null,
  onGoForward,
  onTogglePin,
  onParameterOverrideChange,
  onParameterOverrideRelease,
  onShowUsages,
  usagesCount,
  onSelectVariable,
  variableOptions = [],
  parameterNames = [],
  parameterOverrides = {},
  selectedPeriodIndex = 0,
  seriesValues,
  stability = null,
  variableDescriptions,
  variableUnitMetadata
}: VariableInspectorProps) {
  const showHeroActions = Boolean(onGoBack || onGoForward || onShowUsages || onTogglePin);

  return (
    <section id="notebook-inspect-panel" className="control-panel variable-inspector-panel" role="tabpanel">
      {data ? (
        <div className="variable-inspector-body">
          <div className="variable-inspector-hero-block">
          {stability ? (
            <StabilityInspectorSection
              display={stability.display}
              isComputing={stability.isComputing}
              part="chrome"
              onClearAnalysis={stability.onClearAnalysis}
              onOpenRawData={stability.onOpenRawData}
              onRequestAnalysis={stability.onRequestAnalysis}
              selectedPeriodIndex={selectedPeriodIndex}
              selectedVariableName={data.name}
              simulationResult={stability.simulationResult}
            />
          ) : null}
          <div className="variable-inspector-hero">
            <div className="variable-inspector-hero-title">
              <div className="variable-inspector-title-row">
                <h3>
                  <InspectorVariablePicker
                    currentValues={currentValues}
                    name={data.name}
                    onSelectVariable={onSelectVariable}
                    options={variableOptions}
                    variableDescriptions={variableDescriptions}
                    variableUnitMetadata={variableUnitMetadata}
                  />
                </h3>
                {showHeroActions ? (
                  <div className="variable-inspector-hero-actions">
                    {onTogglePin ? (
                      <button
                        type="button"
                        className="result-chart-pin-button"
                        aria-label={isPinned ? "Dock inspector" : "Pin in floating panel"}
                        aria-pressed={isPinned}
                        title={isPinned ? "Dock inspector" : "Pin in floating panel"}
                        onClick={onTogglePin}
                      >
                        <PinToggleIcon pinned={isPinned} />
                      </button>
                    ) : null}
                    {onGoBack || onGoForward ? (
                      <div className="variable-inspector-nav">
                        <button
                          type="button"
                          className="variable-inspector-nav-button"
                          aria-label="Go back"
                          title="Go back"
                          disabled={!canGoBack}
                          onClick={onGoBack}
                        >
                          <span aria-hidden="true">↩</span>
                        </button>
                        <button
                          type="button"
                          className="variable-inspector-nav-button"
                          aria-label="Go forward"
                          title="Go forward"
                          disabled={!canGoForward}
                          onClick={onGoForward}
                        >
                          <span aria-hidden="true">↪</span>
                        </button>
                      </div>
                    ) : null}
                    {onShowUsages ? (
                      <button
                        type="button"
                        className="variable-inspector-usages-button"
                        onClick={onShowUsages}
                        title={`Show everywhere ${data.name} appears`}
                      >
                        {usagesCount && usagesCount > 0
                          ? `Appears in ${usagesCount} place${usagesCount === 1 ? "" : "s"}`
                          : "Find all usages"}
                        <span aria-hidden="true"> ↗</span>
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
          {seriesValues ? (
            <VariableInspectorSparkline
              selectedPeriodIndex={selectedPeriodIndex}
              seriesValues={seriesValues}
            />
          ) : null}
          </div>

          {stability ? (
            <StabilityInspectorSection
              display={stability.display}
              isComputing={stability.isComputing}
              part="details"
              onClearAnalysis={stability.onClearAnalysis}
              onOpenRawData={stability.onOpenRawData}
              onRequestAnalysis={stability.onRequestAnalysis}
              selectedPeriodIndex={selectedPeriodIndex}
              selectedVariableName={data.name}
              simulationResult={stability.simulationResult}
            />
          ) : null}

          <InspectorSection title={data.description?.trim() || "Definition"}>
            {data.definingEquation ? (
              <InspectorDefiningEquation
                canEdit={canEditDefiningEquation}
                commitStyle={commitStyle}
                currentValues={currentValues}
                laggedCurrentValues={laggedCurrentValues}
                laggedPeriodLabel={laggedPeriodLabel}
                definingEquation={data.definingEquation}
                generatedEquationExplanation={data.generatedEquationExplanation}
                onApplyExpression={onApplyDefiningExpression}
                onEditingChange={onEditingChange}
                onSelectVariable={onSelectVariable}
                parameterNames={parameterNames}
                variableDescriptions={variableDescriptions}
                variableUnitMetadata={variableUnitMetadata}
              />
            ) : null}
            {data.matrixColumnIntegral ? (
              <div className="inspector-matrix-column-sum">
                <p className="inspector-matrix-column-sum-expression">
                  <code>∫ = {data.matrixColumnIntegral.expression}</code>
                </p>
                {data.generatedEquationExplanation ? (
                  <p>{data.generatedEquationExplanation}</p>
                ) : null}
                <StaticChipList
                  emptyLabel="No linked matrix entries."
                  label="Column entries"
                  values={data.matrixColumnIntegral.sources}
                />
              </div>
            ) : null}
            {data.matrixColumnSum ? (
              <div className="inspector-matrix-column-sum">
                <p className="inspector-matrix-column-sum-expression">
                  <code>{data.matrixColumnSum.expression}</code>
                </p>
                {data.generatedEquationExplanation ? (
                  <p>{data.generatedEquationExplanation}</p>
                ) : null}
                {data.matrixColumnSum.stockVariable ? (
                  <p>
                    Linked stock variable:{" "}
                    <button
                      type="button"
                      className="result-variable-button"
                      onClick={() => onSelectVariable(data.matrixColumnSum!.stockVariable!)}
                    >
                      {data.matrixColumnSum.stockVariable}
                    </button>
                  </p>
                ) : null}
                <StaticChipList
                  emptyLabel="No linked matrix entries."
                  label="Column entries"
                  values={data.matrixColumnSum.sources}
                />
              </div>
            ) : null}
            {!data.definingEquation &&
            !data.matrixColumnIntegral &&
            !data.matrixColumnSum ? (
              <p>No defining equation is available for this variable.</p>
            ) : null}
          </InspectorSection>

          {data.kind === "external" &&
          data.externalDefinition?.kind === "constant" &&
          inspectorModelId &&
          onParameterOverrideChange &&
          onParameterOverrideRelease ? (
            <InspectorExternalConstantControl
              externalDefinition={data.externalDefinition}
              hasPendingParameterOverrides={hasPendingParameterOverrides}
              inspectorModelId={inspectorModelId}
              name={data.name}
              onParameterOverrideChange={onParameterOverrideChange}
              onParameterOverrideRelease={onParameterOverrideRelease}
              parameterOverrides={parameterOverrides}
            />
          ) : null}

          <InspectorSection title="Affected equations">
            <InspectorRelatedEquations
              currentValues={currentValues}
              laggedCurrentValues={laggedCurrentValues}
              laggedPeriodLabel={laggedPeriodLabel}
              onSelectVariable={onSelectVariable}
              parameterNames={data.parameterNames}
              relatedEquations={data.relatedEquations}
              selectedVariableName={data.name}
              variableDescriptions={variableDescriptions}
              variableUnitMetadata={variableUnitMetadata}
            />
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
        <div className="variable-inspector-body">
          <div className="variable-inspector-hero-block">
            {stability ? (
              <StabilityInspectorSection
                display={stability.display}
                isComputing={stability.isComputing}
                part="chrome"
                onClearAnalysis={stability.onClearAnalysis}
                onOpenRawData={stability.onOpenRawData}
                onRequestAnalysis={stability.onRequestAnalysis}
                selectedPeriodIndex={selectedPeriodIndex}
                selectedVariableName={null}
                simulationResult={stability.simulationResult}
              />
            ) : null}
            <div className="variable-inspector-hero">
              <div className="variable-inspector-hero-title">
                <div className="variable-inspector-title-row">
                  <h3>
                    <InspectorVariablePicker
                      currentValues={currentValues}
                      name=""
                      onSelectVariable={onSelectVariable}
                      options={variableOptions}
                      variableDescriptions={variableDescriptions}
                      variableUnitMetadata={variableUnitMetadata}
                    />
                  </h3>
                </div>
              </div>
            </div>
          </div>
          {stability ? (
            <StabilityInspectorSection
              display={stability.display}
              isComputing={stability.isComputing}
              part="details"
              onClearAnalysis={stability.onClearAnalysis}
              onOpenRawData={stability.onOpenRawData}
              onRequestAnalysis={stability.onRequestAnalysis}
              selectedPeriodIndex={selectedPeriodIndex}
              selectedVariableName={null}
              simulationResult={stability.simulationResult}
            />
          ) : null}
          <p className="variable-inspector-empty">Select a variable to inspect it here.</p>
        </div>
      )}
    </section>
  );
}

function InspectorRelatedEquations({
  currentValues,
  laggedCurrentValues,
  laggedPeriodLabel,
  onSelectVariable,
  parameterNames,
  relatedEquations,
  selectedVariableName,
  variableDescriptions,
  variableUnitMetadata
}: {
  currentValues?: Record<string, number | undefined>;
  laggedCurrentValues?: Record<string, number | undefined>;
  laggedPeriodLabel?: string;
  onSelectVariable(variableName: string): void;
  parameterNames: string[];
  relatedEquations: VariableInspectorData["relatedEquations"];
  selectedVariableName: string;
  variableDescriptions?: VariableDescriptions;
  variableUnitMetadata?: VariableUnitMetadata;
}) {
  const [showAllUpstream, setShowAllUpstream] = useState(false);

  useEffect(() => {
    setShowAllUpstream(false);
  }, [selectedVariableName]);

  const hiddenUpstreamCount = useMemo(
    () =>
      relatedEquations.filter(
        (entry) => entry.role === "input" && entry.depth > RELATED_EQUATIONS_INITIAL_UPSTREAM_DEPTH
      ).length,
    [relatedEquations]
  );

  const visibleEquations = useMemo(
    () =>
      showAllUpstream
        ? relatedEquations
        : relatedEquations.filter((entry) => isRelatedEquationInitiallyVisible(entry)),
    [relatedEquations, showAllUpstream]
  );

  const visibleUpstreamEquations = useMemo(
    () => visibleEquations.filter((entry) => entry.role === "input"),
    [visibleEquations]
  );
  const upstreamLevels = useMemo(() => {
    const levels: Array<{
      depth: number;
      entries: VariableInspectorData["relatedEquations"];
    }> = [];
    for (const entry of visibleUpstreamEquations) {
      const current = levels[levels.length - 1];
      if (current && current.depth === entry.depth) {
        current.entries.push(entry);
      } else {
        levels.push({ depth: entry.depth, entries: [entry] });
      }
    }
    return levels;
  }, [visibleUpstreamEquations]);
  const visibleOtherEquations = useMemo(
    () => visibleEquations.filter((entry) => entry.role !== "input"),
    [visibleEquations]
  );

  if (relatedEquations.length === 0) {
    return (
      <div className="inspector-empty-note">
        No related equations are available for this variable yet.
      </div>
    );
  }

  function renderRelatedEquation(
    entry: VariableInspectorData["relatedEquations"][number]
  ): ReactNode {
    const description = getRelatedEquationDescription(
      entry.equation.name.trim(),
      entry.equation.desc,
      variableDescriptions
    );
    return (
      <article
        key={entry.equation.id}
        aria-label={`${formatRelatedEquationRole(entry.role)} equation`}
        className={`inspector-related-equation trace-${entry.role}`}
      >
        <div className="inspector-related-equation-expression">
          <code className="inspector-related-equation-formula">
            <InspectorRelatedEquationLhs
              currentValues={currentValues}
              name={entry.equation.name}
              onSelectVariable={onSelectVariable}
              parameterNames={parameterNames}
              traceRole={entry.tokenRoles.get(entry.equation.name.trim())}
              variableDescriptions={variableDescriptions}
              variableUnitMetadata={variableUnitMetadata}
            />
            {" = "}
            {highlightFormula(
              entry.equation.expression,
              new Set(parameterNames),
              entry.tokenRoles,
              variableDescriptions,
              variableUnitMetadata,
              onSelectVariable,
              undefined,
              currentValues,
              null,
              false,
              laggedCurrentValues,
              laggedPeriodLabel,
              collectEquationDenominatorVariables(entry.equation.expression)
            )}
          </code>
        </div>
        {description ? (
          <span className="inspector-related-equation-description">{description}</span>
        ) : null}
      </article>
    );
  }

  return (
    <div className="inspector-related-equation-list">
      {upstreamLevels.map((level, index) => (
        <Fragment key={`upstream-level-${level.depth}`}>
          {index > 0 ? (
            <div
              className="inspector-related-equation-level-rule"
              role="separator"
              aria-label={`Upstream level ${level.depth}`}
            />
          ) : null}
          {level.entries.map((entry) => renderRelatedEquation(entry))}
        </Fragment>
      ))}
      {hiddenUpstreamCount > 0 ? (
        <button
          type="button"
          className="inspector-related-equation-expand"
          aria-expanded={showAllUpstream}
          onClick={() => setShowAllUpstream((current) => !current)}
        >
          {showAllUpstream
            ? "Show fewer upstream equations"
            : `Show ${hiddenUpstreamCount} more upstream equation${
                hiddenUpstreamCount === 1 ? "" : "s"
              }`}
        </button>
      ) : null}
      {visibleOtherEquations.map((entry) => renderRelatedEquation(entry))}
    </div>
  );
}

function InspectorExternalConstantControl({
  externalDefinition,
  hasPendingParameterOverrides,
  inspectorModelId,
  name,
  onParameterOverrideChange,
  onParameterOverrideRelease,
  parameterOverrides
}: {
  externalDefinition: ExternalRow;
  hasPendingParameterOverrides: boolean;
  inspectorModelId: string;
  name: string;
  onParameterOverrideChange(modelId: string, variableName: string, value: number): void;
  onParameterOverrideRelease(): void;
  parameterOverrides: ConstantExternalOverrides;
}) {
  const baselineValue = parseConstantBaselineValue(externalDefinition.valueText);
  if (baselineValue == null) {
    return null;
  }

  const modelOverrides = resolveModelOverrides(parameterOverrides, inspectorModelId);
  const effectiveValue = resolveEffectiveConstantValue(
    baselineValue,
    modelOverrides[name.trim()]
  );

  return (
    <InspectorSection title="Parameter value">
      <div className="inspector-parameter-controls">
        <ParameterSliderControl
          ariaLabel={`${name} parameter value`}
          baselineValue={baselineValue}
          value={effectiveValue}
          onChange={(value) => onParameterOverrideChange(inspectorModelId, name.trim(), value)}
          onRelease={onParameterOverrideRelease}
        />
        <span className="inspector-parameter-value">{effectiveValue}</span>
      </div>
      {hasPendingParameterOverrides ? (
        <p className="status-hint">
          Pending parameter changes — Apply or Discard in Variables → Parameters.
        </p>
      ) : null}
    </InspectorSection>
  );
}

function InspectorDefiningEquation({
  canEdit,
  commitStyle,
  currentValues,
  laggedCurrentValues,
  laggedPeriodLabel,
  definingEquation,
  generatedEquationExplanation,
  onApplyExpression,
  onEditingChange,
  onSelectVariable,
  parameterNames,
  variableDescriptions,
  variableUnitMetadata
}: {
  canEdit: boolean;
  commitStyle: "draft" | "immediate";
  currentValues?: Record<string, number | undefined>;
  laggedCurrentValues?: Record<string, number | undefined>;
  laggedPeriodLabel?: string;
  definingEquation: EquationRow;
  generatedEquationExplanation: string | null;
  onApplyExpression?: (expression: string) => void;
  onEditingChange?: (isEditing: boolean) => void;
  onSelectVariable(variableName: string): void;
  parameterNames: string[];
  variableDescriptions?: VariableDescriptions;
  variableUnitMetadata?: VariableUnitMetadata;
}) {
  const expressionInputRef = useRef<HTMLTextAreaElement | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [draftExpression, setDraftExpression] = useState(definingEquation.expression);
  const parameterNameSet = useMemo(() => new Set(parameterNames), [parameterNames]);
  const denominatorVariableNames = useMemo(
    () => collectEquationDenominatorVariables(definingEquation.expression),
    [definingEquation.expression]
  );
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

  return (
    <>
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
            laggedCurrentValues={laggedCurrentValues}
            laggedPeriodLabel={laggedPeriodLabel}
            denominatorVariableNames={denominatorVariableNames}
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
            <InspectorRelatedEquationLhs
              currentValues={currentValues}
              name={definingEquation.name}
              onSelectVariable={onSelectVariable}
              parameterNames={parameterNames}
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
              onSelectVariable,
              undefined,
              currentValues,
              null,
              false,
              laggedCurrentValues,
              laggedPeriodLabel,
              denominatorVariableNames
            )}
          </code>
        </>
      )}
      {generatedEquationExplanation ? (
        <GeneratedExplanationCollapsible text={generatedEquationExplanation} />
      ) : null}
    </>
  );
}

function GeneratedExplanationCollapsible({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [text]);

  useEffect(() => {
    const preview = previewRef.current;
    if (!preview || open) {
      return;
    }

    const updateTruncated = () => {
      setTruncated(preview.scrollHeight > preview.clientHeight + 1);
    };

    updateTruncated();
    const observer = new ResizeObserver(updateTruncated);
    observer.observe(preview);
    return () => observer.disconnect();
  }, [open, text]);

  return (
    <div
      aria-expanded={open}
      aria-label="Generated explanation"
      className={`inspector-generated-explanation${open ? " is-open" : ""}`.trim()}
      onClick={() => setOpen((value) => !value)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setOpen((value) => !value);
        }
      }}
      role="button"
      tabIndex={0}
    >
      {open ? (
        <p>{text}</p>
      ) : (
        <div ref={previewRef} className="inspector-generated-explanation-preview">
          {text}
          {truncated ? <span className="inspector-generated-explanation-more">...more</span> : null}
        </div>
      )}
    </div>
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
      onClick={(event) => {
        event.stopPropagation();
        onSelectVariable(normalizedName);
      }}
      onMouseDown={(event) => {
        event.stopPropagation();
      }}
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

function getRelatedEquationDescription(
  variableName: string,
  equationDescription: string | undefined,
  variableDescriptions?: VariableDescriptions
): string | null {
  const text =
    variableDescriptions?.get(variableName)?.trim() || equationDescription?.trim() || "";
  return text || null;
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
      <h3 className="inspector-section-heading">
        <span>{title}</span>
      </h3>
      {children}
    </section>
  );
}

function InspectorVariablePicker({
  currentValues,
  name,
  onSelectVariable,
  options,
  variableDescriptions,
  variableUnitMetadata
}: {
  currentValues?: Record<string, number | undefined>;
  name: string;
  onSelectVariable(variableName: string): void;
  options: string[];
  variableDescriptions?: VariableDescriptions;
  variableUnitMetadata?: VariableUnitMetadata;
}) {
  const menuId = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filteredOptions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return options;
    }
    return options.filter((option) => option.toLowerCase().includes(normalized));
  }, [options, query]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    function handlePointerDown(event: MouseEvent): void {
      const target = event.target;
      if (target instanceof Node && containerRef.current?.contains(target)) {
        return;
      }
      setIsOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      searchInputRef.current?.focus();
    } else {
      setQuery("");
    }
  }, [isOpen]);

  const hasName = name.trim().length > 0;
  const triggerLabel = hasName ? (
    <VariableLabel
      currentValues={currentValues}
      name={name}
      variableDescriptions={variableDescriptions}
      variableUnitMetadata={variableUnitMetadata}
    />
  ) : (
    <span className="inspector-variable-picker-placeholder">Select a variable…</span>
  );

  if (options.length === 0) {
    return triggerLabel;
  }

  return (
    <div className="inspector-variable-picker" ref={containerRef}>
      <button
        type="button"
        className="inspector-variable-picker-trigger"
        aria-haspopup="listbox"
        aria-controls={menuId}
        aria-expanded={isOpen ? "true" : "false"}
        onClick={() => setIsOpen((current) => !current)}
      >
        {triggerLabel}
        <span className="inspector-variable-picker-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {isOpen ? (
        <div className="inspector-variable-picker-menu" id={menuId} role="listbox">
          <input
            ref={searchInputRef}
            type="text"
            className="inspector-variable-picker-search"
            placeholder="Filter variables…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="inspector-variable-picker-options">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="option"
                  aria-selected={option === name}
                  className={`inspector-variable-picker-option${
                    option === name ? " is-selected" : ""
                  }`}
                  onClick={() => {
                    onSelectVariable(option);
                    setIsOpen(false);
                  }}
                >
                  <VariableLabel
                    currentValues={currentValues}
                    name={option}
                    variableDescriptions={variableDescriptions}
                    variableUnitMetadata={variableUnitMetadata}
                  />
                </button>
              ))
            ) : (
              <p className="inspector-variable-picker-empty">No matching variables.</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
