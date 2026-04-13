export type DimensionKind = "stock" | "flow" | "aux";

export interface UnitMeta {
  dimensionKind?: DimensionKind;
  baseUnit?: string;
}

export type VariableUnitMetadata = Map<string, UnitMeta>;

export function formatUnitLabel(unitMeta?: UnitMeta): string | null {
  if (!unitMeta?.dimensionKind || unitMeta.dimensionKind === "aux") {
    return null;
  }

  if (!unitMeta.baseUnit) {
    return unitMeta.dimensionKind;
  }

  const suffix = unitMeta.dimensionKind === "flow" ? `${unitMeta.baseUnit}/yr` : unitMeta.baseUnit;
  return `${unitMeta.dimensionKind} (${suffix})`;
}

export function formatUnitText(unitMeta?: UnitMeta): string | null {
  if (!unitMeta?.baseUnit) {
    return null;
  }
  return unitMeta.dimensionKind === "flow" ? `${unitMeta.baseUnit}/yr` : unitMeta.baseUnit;
}

export function formatVariableTooltip(description?: string, unitMeta?: UnitMeta): string | undefined {
  const normalizedDescription = description?.trim();
  const unitLabel = formatUnitLabel(unitMeta);

  if (normalizedDescription && unitLabel) {
    return `${normalizedDescription}\n${unitLabel}`;
  }
  return normalizedDescription ?? unitLabel ?? undefined;
}

export function formatValueWithUnits(
  value: number,
  unitMeta?: UnitMeta,
  options?: { maximumFractionDigits?: number; minimumFractionDigits?: number }
): string {
  if (!Number.isFinite(value)) {
    return "NaN";
  }

  const absoluteValue = Math.abs(Number(value));
  const formattedNumber = absoluteValue.toLocaleString(undefined, {
    maximumFractionDigits: options?.maximumFractionDigits ?? 6,
    minimumFractionDigits: options?.minimumFractionDigits
  });
  const signPrefix = value < 0 ? "-" : "";

  const unitText = formatUnitText(unitMeta);
  if (!unitText) {
    return `${signPrefix}${formattedNumber}`;
  }

  if (unitMeta?.baseUnit === "$") {
    const flowSuffix = unitMeta.dimensionKind === "flow" ? "/yr" : "";
    return `${signPrefix}$${formattedNumber}${flowSuffix}`;
  }

  return `${signPrefix}${formattedNumber} ${unitText}`;
}

export function formatNamedValueWithUnits(
  name: string,
  value: number | undefined,
  unitMeta?: UnitMeta,
  options?: { maximumFractionDigits?: number; minimumFractionDigits?: number }
): string {
  const trimmedName = name.trim();
  if (!trimmedName) {
    return "";
  }
  if (!Number.isFinite(value)) {
    return `${trimmedName} = --`;
  }

  return `${trimmedName} = ${formatValueWithUnits(value as number, unitMeta, options)}`;
}
