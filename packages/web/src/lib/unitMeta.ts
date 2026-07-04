import { isDerivativeBalanceTarget } from "@sfcr/core";

import type { VariableDescriptions } from "./variableDescriptions";

export type BaseDimension = "money" | "items" | "mass" | "energy" | "pp" | "carbon" | "time";
export type StockFlowKind = "stock" | "flow" | "aux";
export type UnitSignature = Partial<Record<BaseDimension, number>>;
type UnitSignatureAlias = "$" | "kg" | "J" | "°C" | "yr";
type UnitSignatureInput = UnitSignature & Partial<Record<UnitSignatureAlias, number>>;

export interface UnitMeta {
  signature?: UnitSignature;
  stockFlow?: StockFlowKind;
  dimensionKind?: StockFlowKind;
  baseUnit?: string;
  displayUnit?: string;
}

interface UnitMetaInput extends Omit<UnitMeta, "signature"> {
  signature?: UnitSignatureInput;
  units?: UnitSignatureInput;
}

export type VariableUnitMetadata = Map<string, UnitMeta>;

const DIMENSION_ORDER: BaseDimension[] = ["money", "items", "mass", "energy", "pp", "carbon", "time"];
const DIMENSION_LABELS: Record<BaseDimension, string> = {
  money: "$",
  items: "items",
  mass: "kg",
  energy: "J",
  pp: "pp",
  carbon: "°C",
  time: "yr"
};
const QUANTITY_DIMENSIONS: BaseDimension[] = ["money", "items", "mass", "energy", "pp", "carbon"];

function isSingleQuantityUnit(
  signature: UnitSignature,
  active: BaseDimension,
  timeExponent: number
): boolean {
  if ((signature.time ?? 0) !== timeExponent) {
    return false;
  }

  return QUANTITY_DIMENSIONS.every(
    (dimension) => (signature[dimension] ?? 0) === (dimension === active ? 1 : 0)
  );
}

function isQuantitylessTimeSignature(signature: UnitSignature, timeExponent: number): boolean {
  if ((signature.time ?? 0) !== timeExponent) {
    return false;
  }

  return QUANTITY_DIMENSIONS.every((dimension) => (signature[dimension] ?? 0) === 0);
}

export function normalizeSignature(signature?: UnitSignature): UnitSignature {
  const normalized: UnitSignature = {};
  if (!signature) {
    return normalized;
  }

  for (const dimension of DIMENSION_ORDER) {
    const exponent = signature[dimension] ?? 0;
    if (exponent !== 0) {
      normalized[dimension] = exponent;
    }
  }

  return normalized;
}

export function normalizeUnitMetaAliases(unitMeta?: UnitMetaInput): UnitMeta | undefined {
  if (!unitMeta) {
    return undefined;
  }

  const rawSignatureInput = unitMeta.signature ?? unitMeta.units;
  const signature = normalizeSignatureInput(unitMeta.signature, unitMeta.units);
  const isExplicitDimensionless =
    rawSignatureInput != null &&
    typeof rawSignatureInput === "object" &&
    !Array.isArray(rawSignatureInput) &&
    Object.keys(rawSignatureInput).length === 0;
  const displayUnit = typeof unitMeta.displayUnit === "string" && unitMeta.displayUnit.trim()
    ? unitMeta.displayUnit.trim()
    : undefined;
  if (signature) {
    return {
      ...(displayUnit ? { displayUnit } : {}),
      stockFlow: unitMeta.stockFlow ?? unitMeta.dimensionKind,
      signature
    };
  }

  if (isExplicitDimensionless) {
    return {
      ...(displayUnit ? { displayUnit } : {}),
      stockFlow: unitMeta.stockFlow ?? unitMeta.dimensionKind,
      signature: {}
    };
  }

  if (!unitMeta.baseUnit && !unitMeta.dimensionKind) {
    return {
      ...(displayUnit ? { displayUnit } : {}),
      stockFlow: unitMeta.stockFlow
    };
  }

  const stockFlow = unitMeta.stockFlow ?? unitMeta.dimensionKind;
  if (!unitMeta.baseUnit) {
    return { stockFlow, signature: {} };
  }

  return {
    ...(displayUnit ? { displayUnit } : {}),
    stockFlow,
    signature:
      stockFlow === "flow"
        ? unitMeta.baseUnit === "$"
          ? { money: 1, time: -1 }
          : { items: 1, time: -1 }
        : unitMeta.baseUnit === "$"
          ? { money: 1 }
          : { items: 1 }
      };
}

export function coerceUnitMeta(unitMeta?: UnitMeta): UnitMeta | undefined {
  return normalizeUnitMetaAliases(unitMeta);
}

function normalizeSignatureInput(
  ...candidates: Array<UnitSignatureInput | undefined>
): UnitSignature | undefined {
  const merged: UnitSignature = {};

  for (const signature of candidates) {
    if (!signature) {
      continue;
    }

    const money = signature.money ?? signature["$"];
    const items = signature.items;
    const mass = signature.mass ?? signature.kg;
    const energy = signature.energy ?? signature.J;
    const pp = signature.pp;
    const carbon = signature.carbon ?? signature["°C"];
    const time = signature.time ?? signature.yr;

    if (money !== undefined) {
      merged.money = money;
    }
    if (items !== undefined) {
      merged.items = items;
    }
    if (mass !== undefined) {
      merged.mass = mass;
    }
    if (energy !== undefined) {
      merged.energy = energy;
    }
    if (pp !== undefined) {
      merged.pp = pp;
    }
    if (carbon !== undefined) {
      merged.carbon = carbon;
    }
    if (time !== undefined) {
      merged.time = time;
    }
  }

  if (Object.keys(merged).length === 0) {
    return undefined;
  }

  return normalizeSignature(merged);
}

export function signaturesEqual(a?: UnitSignature, b?: UnitSignature): boolean {
  const left = normalizeSignature(a);
  const right = normalizeSignature(b);

  return DIMENSION_ORDER.every(
    (dimension) => (left[dimension] ?? 0) === (right[dimension] ?? 0)
  );
}

export function multiplySignatures(a?: UnitSignature, b?: UnitSignature): UnitSignature {
  return normalizeSignature({
    money: (a?.money ?? 0) + (b?.money ?? 0),
    items: (a?.items ?? 0) + (b?.items ?? 0),
    mass: (a?.mass ?? 0) + (b?.mass ?? 0),
    energy: (a?.energy ?? 0) + (b?.energy ?? 0),
    pp: (a?.pp ?? 0) + (b?.pp ?? 0),
    carbon: (a?.carbon ?? 0) + (b?.carbon ?? 0),
    time: (a?.time ?? 0) + (b?.time ?? 0)
  });
}

export function divideSignatures(a?: UnitSignature, b?: UnitSignature): UnitSignature {
  return normalizeSignature({
    money: (a?.money ?? 0) - (b?.money ?? 0),
    items: (a?.items ?? 0) - (b?.items ?? 0),
    mass: (a?.mass ?? 0) - (b?.mass ?? 0),
    energy: (a?.energy ?? 0) - (b?.energy ?? 0),
    pp: (a?.pp ?? 0) - (b?.pp ?? 0),
    carbon: (a?.carbon ?? 0) - (b?.carbon ?? 0),
    time: (a?.time ?? 0) - (b?.time ?? 0)
  });
}

export function formatSignature(signature?: UnitSignature): string {
  const normalized = normalizeSignature(signature);
  const numerator: string[] = [];
  const denominator: string[] = [];

  for (const dimension of DIMENSION_ORDER) {
    const exponent = normalized[dimension] ?? 0;
    const label = DIMENSION_LABELS[dimension];
    if (exponent > 0) {
      numerator.push(exponent === 1 ? label : `${label}^${exponent}`);
    } else if (exponent < 0) {
      const absoluteExponent = Math.abs(exponent);
      denominator.push(absoluteExponent === 1 ? label : `${label}^${absoluteExponent}`);
    }
  }

  if (numerator.length === 0 && denominator.length === 0) {
    return "1";
  }
  if (denominator.length === 0) {
    return numerator.join(" * ");
  }
  if (numerator.length === 0) {
    return `1/${denominator.join(" * ")}`;
  }

  return `${numerator.join(" * ")}/${denominator.join(" * ")}`;
}

export function formatUnitLabel(unitMeta?: UnitMeta): string | null {
  return formatUnitText(unitMeta);
}

const TIME_STEP_SIGNATURE: UnitSignature = { time: 1 };

export function formatUnitTextForVariableName(
  variableName: string,
  unitMeta?: UnitMeta
): string | null {
  const normalized = coerceUnitMeta(unitMeta);
  if (!normalized?.signature) {
    return formatUnitText(normalized);
  }

  if (isDerivativeBalanceTarget(variableName)) {
    return formatUnitText({
      ...normalized,
      stockFlow: "flow",
      signature: divideSignatures(normalized.signature, TIME_STEP_SIGNATURE)
    });
  }

  return formatUnitText(normalized);
}

export function formatUnitText(unitMeta?: UnitMeta): string | null {
  const normalizedMeta = coerceUnitMeta(unitMeta);
  if (normalizedMeta?.displayUnit) {
    return normalizedMeta.displayUnit;
  }

  const signature = normalizeSignature(normalizedMeta?.signature);
  if (Object.keys(signature).length === 0) {
    return null;
  }

  if (isSingleQuantityUnit(signature, "money", 0)) {
    return "$";
  }
  if (isSingleQuantityUnit(signature, "money", -1)) {
    return "$/yr";
  }
  if (isSingleQuantityUnit(signature, "items", 0)) {
    return "items";
  }
  if (isSingleQuantityUnit(signature, "items", -1)) {
    return "items/yr";
  }
  if (isSingleQuantityUnit(signature, "mass", 0)) {
    return "kg";
  }
  if (isSingleQuantityUnit(signature, "mass", -1)) {
    return "kg/yr";
  }
  if (isSingleQuantityUnit(signature, "energy", 0)) {
    return "J";
  }
  if (isSingleQuantityUnit(signature, "energy", -1)) {
    return "J/yr";
  }
  if (isSingleQuantityUnit(signature, "pp", 0)) {
    return "pp";
  }
  if (isSingleQuantityUnit(signature, "pp", -1)) {
    return "pp/yr";
  }
  if (isSingleQuantityUnit(signature, "carbon", 0)) {
    return "°C";
  }
  if (isSingleQuantityUnit(signature, "carbon", -1)) {
    return "°C/yr";
  }
  if (isQuantitylessTimeSignature(signature, 1)) {
    return "yr";
  }
  if (isQuantitylessTimeSignature(signature, -1)) {
    return "1/yr";
  }

  return formatSignature(signature);
}

export function formatVariableTooltip(
  description?: string,
  unitMeta?: UnitMeta,
  variableName?: string
): string | undefined {
  const normalizedDescription = description?.trim();
  const unitLabel = variableName?.trim()
    ? formatUnitTextForVariableName(variableName, unitMeta)
    : formatUnitText(unitMeta);

  if (normalizedDescription && unitLabel) {
    return `${normalizedDescription}\n${unitLabel}`;
  }
  return normalizedDescription ?? unitLabel ?? undefined;
}

export function resolveVariableTooltip(args: {
  name: string;
  description?: string;
  variableDescriptions?: VariableDescriptions;
  variableUnitMetadata?: VariableUnitMetadata;
  currentValue?: number;
  currentValues?: Record<string, number | undefined>;
  laggedCurrentValues?: Record<string, number | undefined>;
  valueReference?: "current" | "lagged";
  laggedPeriodLabel?: string;
}): string | undefined {
  const normalizedName = args.name.trim();
  const useLagged = args.valueReference === "lagged";
  const resolvedDescription =
    args.description ??
    (normalizedName ? args.variableDescriptions?.get(normalizedName) : undefined);
  const unitMeta = normalizedName ? args.variableUnitMetadata?.get(normalizedName) : undefined;
  const resolvedValue = useLagged
    ? args.laggedCurrentValues?.[normalizedName]
    : args.currentValue ?? (normalizedName ? args.currentValues?.[normalizedName] : undefined);

  if (typeof resolvedValue === "number" && Number.isFinite(resolvedValue)) {
    const formattedValue = formatValueWithUnits(resolvedValue, unitMeta);
    const periodHint =
      useLagged && args.laggedPeriodLabel ? ` (${args.laggedPeriodLabel})` : "";
    const valueName = useLagged && normalizedName ? `${normalizedName}'` : normalizedName;
    if (resolvedDescription) {
      return `${resolvedDescription} : ${formattedValue}${periodHint}`;
    }
    return valueName ? `${valueName} = ${formattedValue}${periodHint}` : `${formattedValue}${periodHint}`;
  }

  return formatVariableTooltip(resolvedDescription, unitMeta, normalizedName);
}

export interface NumericValueParts {
  leadingSymbol: string;
  integerPart: string;
  decimalSeparator: string | null;
  fractionPart: string | null;
  unitSuffix: string;
}

function formatNumericUnitSuffix(unitText: string | null): string {
  if (!unitText) {
    return "";
  }
  if (unitText.startsWith("$")) {
    return unitText.slice(1);
  }
  return unitText;
}

function formatNumericLeadingSymbol(sign: string, unitText: string | null): string {
  if (unitText?.startsWith("$")) {
    return `${sign}$`;
  }
  return sign;
}

function formatNumericAmountParts(
  absoluteValue: number,
  options?: { maximumFractionDigits?: number; minimumFractionDigits?: number }
): Pick<NumericValueParts, "integerPart" | "decimalSeparator" | "fractionPart"> {
  const parts = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: options?.maximumFractionDigits ?? 6,
    minimumFractionDigits: options?.minimumFractionDigits,
    useGrouping: true
  }).formatToParts(absoluteValue);

  let integerPart = "";
  let decimalSeparator: string | null = null;
  let fractionPart: string | null = null;

  for (const part of parts) {
    if (part.type === "integer" || part.type === "group") {
      integerPart += part.value;
    } else if (part.type === "decimal") {
      decimalSeparator = part.value;
    } else if (part.type === "fraction") {
      fractionPart = part.value;
    }
  }

  return { integerPart, decimalSeparator, fractionPart };
}

export function formatNumericValueParts(
  value: number,
  unitMeta?: UnitMeta,
  options?: { maximumFractionDigits?: number; minimumFractionDigits?: number }
): NumericValueParts | null {
  if (!Number.isFinite(value)) {
    return null;
  }

  const absoluteValue = Math.abs(Number(value));
  const sign = value < 0 ? "-" : "";
  const unitText = formatUnitText(unitMeta);
  const amountParts = formatNumericAmountParts(absoluteValue, options);

  return {
    leadingSymbol: formatNumericLeadingSymbol(sign, unitText),
    ...amountParts,
    unitSuffix: formatNumericUnitSuffix(unitText)
  };
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

  if (unitText.startsWith("$")) {
    return `${signPrefix}$${formattedNumber}${unitText.slice(1)}`;
  }

  if (unitText === "%") {
    return `${signPrefix}${formattedNumber}%`;
  }

  return `${signPrefix}${formattedNumber} ${unitText}`;
}
