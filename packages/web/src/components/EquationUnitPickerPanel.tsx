import { useMemo } from "react";

import { derivativeBalanceStockName, isDerivativeBalanceTarget } from "@sfcr/core";

import {
  CARBON_UNIT_PRESET_OPTIONS,
  ECONOMIC_UNIT_PRESET_OPTIONS,
  OTHER_UNIT_PRESET_OPTIONS,
  equationUnitMetaToPresetMeta,
  presetToEquationUnitMeta,
  unitMetasEqual,
  type EquationUnitPresetOption
} from "../lib/unitPicker";
import { coerceUnitMeta, type UnitMeta, type VariableUnitMetadata } from "../lib/unitMeta";
import { getEquationRowUnitLabel, suggestEquationUnitMeta } from "../lib/units";

export function EquationUnitPickerPanel({
  className,
  expression,
  onChange,
  unitMeta,
  variableName,
  variableUnitMetadata
}: {
  className?: string;
  expression: string;
  onChange: (unitMeta: UnitMeta | undefined) => void;
  unitMeta?: UnitMeta;
  variableName: string;
  variableUnitMetadata?: VariableUnitMetadata;
}) {
  const normalized = coerceUnitMeta(unitMeta);
  const derivativeBalanceStock = derivativeBalanceStockName(variableName);
  const activePresetMeta = equationUnitMetaToPresetMeta(variableName, normalized);
  const suggestion = useMemo(
    () =>
      suggestEquationUnitMeta({
        variableName,
        expression,
        variableUnitMetadata: variableUnitMetadata ?? new Map()
      }),
    [variableName, expression, variableUnitMetadata]
  );
  const canSuggest = suggestion != null;

  function handleSelectPreset(preset?: UnitMeta): void {
    onChange(presetToEquationUnitMeta(variableName, preset));
  }

  function handleSuggest(): void {
    if (!suggestion) {
      return;
    }
    onChange(presetToEquationUnitMeta(variableName, suggestion));
  }

  return (
    <div
      className={`equation-unit-picker-panel${className ? ` ${className}` : ""}`.trim()}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="equation-unit-picker-header">
        <button
          aria-label="Suggest units from expression"
          className="equation-unit-picker-action secondary-button"
          disabled={!canSuggest}
          onClick={handleSuggest}
          type="button"
        >
          Suggest
        </button>
      </div>
      {isDerivativeBalanceTarget(variableName) && derivativeBalanceStock && normalized?.signature ? (
        <p className="equation-unit-picker-note">
          Defines stock {derivativeBalanceStock} (
          {getEquationRowUnitLabel(derivativeBalanceStock, normalized) ?? "units"}). The badge shows the per-year
          change.
        </p>
      ) : null}
      <div className="equation-unit-popover-columns" role="group" aria-label="Unit options">
        <EquationUnitPresetColumn
          activePresetMeta={activePresetMeta}
          label="Economic"
          onSelect={handleSelectPreset}
          options={ECONOMIC_UNIT_PRESET_OPTIONS}
        />
        <EquationUnitPresetColumn
          activePresetMeta={activePresetMeta}
          label="Other"
          onSelect={handleSelectPreset}
          options={OTHER_UNIT_PRESET_OPTIONS}
        />
        <EquationUnitPresetColumn
          activePresetMeta={activePresetMeta}
          label="°C"
          onSelect={handleSelectPreset}
          options={CARBON_UNIT_PRESET_OPTIONS}
        />
      </div>
    </div>
  );
}

function EquationUnitPresetColumn({
  activePresetMeta,
  label,
  onSelect,
  options
}: {
  activePresetMeta: UnitMeta | undefined;
  label: string;
  onSelect: (preset?: UnitMeta) => void;
  options: EquationUnitPresetOption[];
}) {
  return (
    <div className="equation-unit-popover-column" role="listbox" aria-label={`${label} unit options`}>
      <div className="equation-unit-popover-column-label">{label}</div>
      {options.map((option) => (
        <button
          key={option.label}
          className={`equation-unit-option${
            unitMetasEqual(activePresetMeta, option.unitMeta) ? " is-active" : ""
          }`.trim()}
          onClick={() => onSelect(option.unitMeta)}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function formatEquationUnitPickerLabel(variableName: string, unitMeta?: UnitMeta): string {
  return getEquationRowUnitLabel(variableName, coerceUnitMeta(unitMeta)) ?? "Set units";
}
