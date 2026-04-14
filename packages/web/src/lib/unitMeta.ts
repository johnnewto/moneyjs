export type BaseDimension = "money" | "items" | "time";
export type StockFlowKind = "stock" | "flow" | "aux";
export type UnitSignature = Partial<Record<BaseDimension, number>>;

export interface UnitMeta {
  signature?: UnitSignature;
  stockFlow?: StockFlowKind;
  dimensionKind?: StockFlowKind;
  baseUnit?: string;
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

export function coerceUnitMeta(unitMeta?: UnitMeta): UnitMeta | undefined {
  if (!unitMeta) {
    return undefined;
  }
  if (unitMeta.signature) {
    return {
      ...unitMeta,
      signature: normalizeSignature(unitMeta.signature),
      stockFlow: unitMeta.stockFlow ?? unitMeta.dimensionKind
    };
  }

  if (!unitMeta.baseUnit && !unitMeta.dimensionKind) {
    return unitMeta;
  }

  const stockFlow = unitMeta.stockFlow ?? unitMeta.dimensionKind;
  if (!unitMeta.baseUnit) {
    return { ...unitMeta, stockFlow, signature: {} };
  }

  return {
    ...unitMeta,
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

export function formatUnitText(unitMeta?: UnitMeta): string | null {
  const signature = normalizeSignature(coerceUnitMeta(unitMeta)?.signature);
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

export function formatVariableTooltip(description?: string, unitMeta?: UnitMeta): string | undefined {
  const normalizedDescription = description?.trim();
  const unitLabel = formatUnitText(unitMeta);

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

  if (unitText.startsWith("$")) {
    return `${signPrefix}$${formattedNumber}${unitText.slice(1)}`;
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
