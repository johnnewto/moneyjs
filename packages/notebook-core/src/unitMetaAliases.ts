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

interface SerializedUnitMeta {
  displayUnit?: string;
  stockFlow?: StockFlowKind;
  units?: Partial<Record<BaseDimension | UnitSignatureAlias, number>>;
}

const DIMENSION_ORDER: BaseDimension[] = ["money", "items", "mass", "energy", "pp", "carbon", "time"];

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

export function serializeUnitMetaAliases(unitMeta?: UnitMeta): SerializedUnitMeta | undefined {
  const normalized = coerceUnitMeta(unitMeta);
  if (!normalized) {
    return undefined;
  }

  const units: SerializedUnitMeta["units"] = {};
  const signature = normalizeSignature(normalized.signature);
  const money = signature.money;
  const items = signature.items;
  const mass = signature.mass;
  const energy = signature.energy;
  const pp = signature.pp;
  const carbon = signature.carbon;
  const time = signature.time;

  if (money !== undefined) {
    units.$ = money;
  }
  if (items !== undefined) {
    units.items = items;
  }
  if (mass !== undefined) {
    units.kg = mass;
  }
  if (energy !== undefined) {
    units.J = energy;
  }
  if (pp !== undefined) {
    units.pp = pp;
  }
  if (carbon !== undefined) {
    units["°C"] = carbon;
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
