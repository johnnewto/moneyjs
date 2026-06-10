import type { ReactNode } from "react";

import {
  formatNumericValueParts,
  formatValueWithUnits,
  type UnitMeta
} from "../lib/unitMeta";

interface NumericValueTextProps {
  className?: string;
  decimalAligned?: boolean;
  fallback?: string;
  prefix?: ReactNode;
  unitMeta?: UnitMeta;
  value: number | undefined;
  options?: { maximumFractionDigits?: number; minimumFractionDigits?: number };
}

export function NumericValueText({
  className,
  decimalAligned = false,
  fallback = "NaN",
  prefix,
  unitMeta,
  value,
  options
}: NumericValueTextProps) {
  if (!Number.isFinite(value)) {
    return <span className={className}>{prefix ?? ""}{fallback}</span>;
  }

  const numericValue = value as number;

  if (decimalAligned) {
    const parts = formatNumericValueParts(numericValue, unitMeta, options);
    if (!parts) {
      return <span className={className}>{prefix ?? ""}{fallback}</span>;
    }

    return (
      <span className={className}>
        {prefix ? <span>{prefix}</span> : null}
        <span
          className={`notebook-current-value${
            numericValue < 0 ? " numeric-value-negative" : ""
          }`.trim()}
        >
          <span className="notebook-current-value-leading">{parts.leadingSymbol}</span>
          <span className="notebook-current-value-integer">{parts.integerPart}</span>
          {parts.decimalSeparator && parts.fractionPart != null ? (
            <>
              <span className="notebook-current-value-separator">{parts.decimalSeparator}</span>
              <span className="notebook-current-value-fraction">{parts.fractionPart}</span>
            </>
          ) : null}
          <span className="notebook-current-value-unit">{parts.unitSuffix}</span>
        </span>
      </span>
    );
  }

  return (
    <span className={className}>
      {prefix ? <span>{prefix}</span> : null}
      <span className={numericValue < 0 ? "numeric-value-negative" : undefined}>
        {formatValueWithUnits(numericValue, unitMeta, options)}
      </span>
    </span>
  );
}
