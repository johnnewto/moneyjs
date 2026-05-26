import { useEffect, useMemo, useState, type KeyboardEvent } from "react";

import {
  countSeriesExternals,
  listConstantParameterEntries,
  resolveEffectiveConstantValue,
  resolveModelOverrides,
  type ConstantExternalOverrides
} from "../lib/externalParameterControls";
import type { CatalogModelContext } from "../lib/variableCatalog";
import type { VariableUnitMetadata } from "../lib/unitMeta";
import { formatUnitLabel } from "../lib/unitMeta";
import { ParameterSliderControl } from "./ParameterSliderControl";
import { VariableMathLabel } from "./VariableMathLabel";

interface VariableParametersPanelProps {
  catalogModelContexts: CatalogModelContext[];
  hasPendingParameterOverrides: boolean;
  onApply(): void;
  onDiscard(): void;
  onOverrideChange(modelId: string, name: string, value: number): void;
  onOverrideRelease(): void;
  onSelectVariable?(variableName: string): void;
  parameterOverrides: ConstantExternalOverrides;
  variableUnitMetadata?: VariableUnitMetadata;
}

export function VariableParametersPanel({
  catalogModelContexts,
  hasPendingParameterOverrides,
  onApply,
  onDiscard,
  onOverrideChange,
  onOverrideRelease,
  onSelectVariable,
  parameterOverrides,
  variableUnitMetadata
}: VariableParametersPanelProps) {
  const entries = useMemo(
    () => listConstantParameterEntries(catalogModelContexts),
    [catalogModelContexts]
  );
  const seriesExternalCount = useMemo(
    () => countSeriesExternals(catalogModelContexts),
    [catalogModelContexts]
  );

  const entriesByModel = useMemo(() => {
    const groups = new Map<string, typeof entries>();
    for (const entry of entries) {
      const group = groups.get(entry.modelId) ?? [];
      group.push(entry);
      groups.set(entry.modelId, group);
    }
    return [...groups.entries()];
  }, [entries]);

  const showModelHeaders = catalogModelContexts.length > 1;

  return (
    <div className="variable-parameters-panel">
      {entries.length === 0 ? (
        <p className="variable-parameters-empty">
          No constant externals with numeric values. Add parameters in the Externals cell.
        </p>
      ) : (
        <div className="variable-parameters-list">
          {entriesByModel.map(([modelId, modelEntries]) => (
            <section key={modelId} className="variable-parameters-model-group">
              {showModelHeaders ? (
                <h3 className="variable-parameters-model-title">{modelEntries[0]?.modelTitle}</h3>
              ) : null}
              {modelEntries.map((entry) => (
                <ParameterSliderRow
                  key={`${entry.modelId}-${entry.external.id}`}
                  entry={entry}
                  modelOverrides={resolveModelOverrides(parameterOverrides, entry.modelId)}
                  onOverrideChange={onOverrideChange}
                  onOverrideRelease={onOverrideRelease}
                  onSelectVariable={onSelectVariable}
                  variableUnitMetadata={variableUnitMetadata}
                />
              ))}
            </section>
          ))}
        </div>
      )}

      {seriesExternalCount > 0 ? (
        <p className="variable-parameters-series-note status-hint">
          {seriesExternalCount} series external{seriesExternalCount === 1 ? "" : "s"} — edit in the
          Externals cell.
        </p>
      ) : null}

      <div className="variable-parameters-footer">
        <span className="variable-parameters-pending status-hint">
          {hasPendingParameterOverrides
            ? "Pending parameter changes (sandbox)."
            : "Adjust parameters, then Apply to save."}
        </span>
        <div className="button-row">
          <button type="button" onClick={onApply} disabled={!hasPendingParameterOverrides}>
            Apply
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={onDiscard}
            disabled={!hasPendingParameterOverrides}
          >
            Discard
          </button>
        </div>
      </div>
    </div>
  );
}

function ParameterSliderRow({
  entry,
  modelOverrides,
  onOverrideChange,
  onOverrideRelease,
  onSelectVariable,
  variableUnitMetadata
}: {
  entry: ReturnType<typeof listConstantParameterEntries>[number];
  modelOverrides: Record<string, number>;
  onOverrideChange(modelId: string, name: string, value: number): void;
  onOverrideRelease(): void;
  onSelectVariable?(variableName: string): void;
  variableUnitMetadata?: VariableUnitMetadata;
}) {
  const name = entry.external.name.trim();
  const override = modelOverrides[name];
  const effectiveValue = resolveEffectiveConstantValue(entry.baselineValue, override);
  const hasOverride = override !== undefined;
  const unitLabel = formatUnitLabel(entry.external.unitMeta);
  const [numericDraft, setNumericDraft] = useState<string | null>(null);
  const displayValue = numericDraft ?? String(effectiveValue);

  useEffect(() => {
    setNumericDraft(null);
  }, [effectiveValue]);

  function commitNumericValue(raw: string): void {
    const parsed = Number(raw.trim());
    if (!Number.isFinite(parsed)) {
      setNumericDraft(null);
      return;
    }

    setNumericDraft(null);
    onOverrideChange(entry.modelId, name, parsed);
    onOverrideRelease();
  }

  function handleNumericKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Enter") {
      event.currentTarget.blur();
    }
  }

  return (
    <article
      className={`parameter-slider-row${hasOverride ? " has-override" : ""}`}
      data-parameter-name={name}
    >
      <div className="parameter-slider-row-header">
        {onSelectVariable ? (
          <button
            type="button"
            className="result-variable-button parameter-slider-name-button"
            onClick={() => onSelectVariable(name)}
          >
            <VariableMathLabel name={name} />
          </button>
        ) : (
          <VariableMathLabel name={name} />
        )}
        {unitLabel ? <span className="parameter-slider-unit inspector-badge is-muted">{unitLabel}</span> : null}
      </div>
      {entry.external.desc?.trim() ? (
        <p className="parameter-slider-description">{entry.external.desc.trim()}</p>
      ) : null}
      <div className="parameter-slider-controls">
        <ParameterSliderControl
          ariaLabel={`${name} parameter value`}
          baselineValue={entry.baselineValue}
          value={effectiveValue}
          onChange={(value) => onOverrideChange(entry.modelId, name, value)}
          onRelease={onOverrideRelease}
        />
        <input
          type="text"
          className="parameter-slider-numeric-input"
          inputMode="decimal"
          aria-label={`${name} numeric value`}
          value={displayValue}
          onChange={(event) => setNumericDraft(event.target.value)}
          onBlur={(event) => commitNumericValue(event.target.value)}
          onKeyDown={handleNumericKeyDown}
        />
        {hasOverride ? (
          <span className="parameter-slider-baseline status-hint" title="Committed value in notebook">
            was {entry.baselineValue}
          </span>
        ) : null}
      </div>
    </article>
  );
}
