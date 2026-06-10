import type { JSX } from "react";

import { NumericValueText } from "../../components/NumericValueText";
import { VariableLabel } from "../../components/VariableLabel";
import { buildVariableUnitMetadata } from "../../lib/units";
import type { VariableDescriptions } from "../../lib/variableDescriptions";

export function formatNotebookCurrentValue(
  name: string,
  value: number | undefined,
  variableDescriptions?: VariableDescriptions,
  variableUnitMetadata?: ReturnType<typeof buildVariableUnitMetadata>,
  includeVariablePrefix = true,
  maximumFractionDigits = 6,
  decimalAligned = false
): JSX.Element | string {
  const trimmedName = name.trim();
  if (!trimmedName) {
    return "";
  }

  const formatOptions = decimalAligned
    ? { maximumFractionDigits, minimumFractionDigits: maximumFractionDigits }
    : { maximumFractionDigits };

  if (!includeVariablePrefix) {
    return (
      <NumericValueText
        decimalAligned={decimalAligned}
        fallback="--"
        unitMeta={variableUnitMetadata?.get(trimmedName)}
        value={value}
        options={formatOptions}
      />
    );
  }

  return (
    <NumericValueText
      decimalAligned={decimalAligned}
      prefix={
        <>
          <VariableLabel
            name={trimmedName}
            variableDescriptions={variableDescriptions}
            variableUnitMetadata={variableUnitMetadata}
          />{" "}
          ={" "}
        </>
      }
      fallback="--"
      unitMeta={variableUnitMetadata?.get(trimmedName)}
      value={value}
      options={formatOptions}
    />
  );
}
