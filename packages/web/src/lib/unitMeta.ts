import { isDerivativeBalanceTarget } from "@sfcr/core";

import type { VariableDescriptions } from "./variableDescriptions";

export type BaseDimension = "money" | "items" | "time";
export type StockFlowKind = "stock" | "flow" | "aux";
export type UnitSignature = Partial<Record<BaseDimension, number>>;
type UnitSignatureAlias = "$" | "yr";
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

interface SerializedUnitMeta {
  displayUnit?: string;
  stockFlow?: StockFlowKind;
  units?: Partial<Record<BaseDimension | UnitSignatureAlias, number>>;
}

export type VariableUnitMetadata = Map<string, UnitMeta>;

const DIMENSION_ORDER: BaseDimension[] = ["money", "items", "time"];
const DIMENSION_LABELS: Record<BaseDimension, string> = {
  money: "$",
  items: "items",
  time: "yr"
};

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

  const signature = normalizeSignatureInput(unitMeta.signature, unitMeta.units);
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

export function serializeUnitMetaAliases(unitMeta?: UnitMeta): SerializedUnitMeta | undefined {
  const normalized = coerceUnitMeta(unitMeta);
  if (!normalized) {
    return undefined;
  }

  const units: SerializedUnitMeta["units"] = {};
  const signature = normalizeSignature(normalized.signature);
  const money = signature.money;
  const items = signature.items;
  const time = signature.time;

  if (money !== undefined) {
    units.$ = money;
  }
  if (items !== undefined) {
    units.items = items;
  }
  if (time !== undefined) {
    units.yr = time;
  }

  return {
    ...(normalized.displayUnit ? { displayUnit: normalized.displayUnit } : {}),
    ...(normalized.stockFlow ? { stockFlow: normalized.stockFlow } : {}),
    ...(Object.keys(units).length > 0 ? { units } : {})
  };
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
    const time = signature.time ?? signature.yr;

    if (money !== undefined) {
      merged.money = money;
    }
    if (items !== undefined) {
      merged.items = items;
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
    time: (a?.time ?? 0) + (b?.time ?? 0)
  });
}

export function divideSignatures(a?: UnitSignature, b?: UnitSignature): UnitSignature {
  return normalizeSignature({
    money: (a?.money ?? 0) - (b?.money ?? 0),
    items: (a?.items ?? 0) - (b?.items ?? 0),
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

  if ((signature.money ?? 0) === 1 && (signature.items ?? 0) === 0) {
    if ((signature.time ?? 0) === 0) {
      return "$";
    }
    if ((signature.time ?? 0) === -1) {
      return "$/yr";
    }
  }

  if ((signature.items ?? 0) === 1 && (signature.money ?? 0) === 0) {
    if ((signature.time ?? 0) === 0) {
      return "items";
    }
    if ((signature.time ?? 0) === -1) {
      return "items/yr";
    }
  }

  if ((signature.time ?? 0) === -1 && (signature.money ?? 0) === 0 && (signature.items ?? 0) === 0) {
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
