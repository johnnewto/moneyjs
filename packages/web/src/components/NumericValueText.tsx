import type { ReactNode } from "react";

import { formatValueWithUnits, type UnitMeta } from "../lib/unitMeta";

interface NumericValueTextProps {
  className?: string;
  fallback?: string;
  prefix?: ReactNode;
  unitMeta?: UnitMeta;
  value: number | undefined;
  options?: { maximumFractionDigits?: number; minimumFractionDigits?: number };
}

export function NumericValueText({
  className,
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

  return (
    <span className={className}>
      {prefix ? <span>{prefix}</span> : null}
      <span className={numericValue < 0 ? "numeric-value-negative" : undefined}>
        {formatValueWithUnits(numericValue, unitMeta, options)}
      </span>
    </span>
  );
}
