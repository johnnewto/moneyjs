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

const DIMENSION_ORDER: BaseDimension[] = ["money", "items", "time"];

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
