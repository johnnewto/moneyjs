export type SectorAssignmentSource =
  | "transaction-matrix"
  | "balance-matrix"
  | "explicit"
  | "fallback";

export type SectorConfidence = "high" | "mixed" | "fallback";

export type SectorAccountKind = "stock" | "flow" | "auxiliary" | "exogenous";

export interface VariableSectorInfo {
  variable: string;
  sector: string;
  source: SectorAssignmentSource;
  confidence: SectorConfidence;
  accountKind?: SectorAccountKind;
}

export interface SectorTopology {
  sectors: string[];
  variables: Record<string, VariableSectorInfo>;
}

export interface SectorEdgeClassification {
  sourceSector: string | null;
  targetSector: string | null;
  crossSector: boolean;
}

const DEFAULT_SECTOR = "Unmapped";

export function createSectorTopology(
  entries: Iterable<VariableSectorInfo>,
  options?: { includeDefaultSector?: boolean }
): SectorTopology {
  const byVariable = new Map<string, VariableSectorInfo[]>();
  const sectors: string[] = [];
  const sectorSet = new Set<string>();

  for (const entry of entries) {
    const variable = entry.variable.trim();
    const sector = entry.sector.trim();
    if (!variable || !sector) {
      continue;
    }
    const normalized = { ...entry, variable, sector };
    const bucket = byVariable.get(variable) ?? [];
    bucket.push(normalized);
    byVariable.set(variable, bucket);
    if (!sectorSet.has(sector)) {
      sectorSet.add(sector);
      sectors.push(sector);
    }
  }

  if (options?.includeDefaultSector !== false && !sectorSet.has(DEFAULT_SECTOR)) {
    sectors.push(DEFAULT_SECTOR);
  }

  const variables = Object.fromEntries(
    Array.from(byVariable.entries()).map(([variable, bucket]) => [
      variable,
      mergeVariableSectorInfos(bucket)
    ])
  );

  return { sectors, variables };
}

export function mergeSectorTopologies(topologies: ReadonlyArray<SectorTopology>): SectorTopology {
  const entries: VariableSectorInfo[] = [];
  topologies.forEach((topology) => {
    Object.values(topology.variables).forEach((entry) => entries.push(entry));
  });
  return createSectorTopology(entries);
}

export function resolveVariableSectorInfo(
  topology: SectorTopology,
  variable: string
): VariableSectorInfo | null {
  return topology.variables[variable] ?? null;
}

export function groupVariablesBySector(
  variables: Iterable<string>,
  topology: SectorTopology
): Map<string, string[]> {
  const grouped = new Map<string, string[]>();

  for (const variable of variables) {
    const sector = resolveVariableSectorInfo(topology, variable)?.sector ?? DEFAULT_SECTOR;
    const bucket = grouped.get(sector) ?? [];
    bucket.push(variable);
    grouped.set(sector, bucket);
  }

  return grouped;
}

export function classifySectorEdge(
  topology: SectorTopology,
  sourceVariable: string,
  targetVariable: string
): SectorEdgeClassification {
  const sourceSector = resolveVariableSectorInfo(topology, sourceVariable)?.sector ?? null;
  const targetSector = resolveVariableSectorInfo(topology, targetVariable)?.sector ?? null;
  return {
    sourceSector,
    targetSector,
    crossSector:
      sourceSector != null &&
      targetSector != null &&
      sourceSector !== DEFAULT_SECTOR &&
      targetSector !== DEFAULT_SECTOR &&
      sourceSector !== targetSector
  };
}

function mergeVariableSectorInfos(entries: ReadonlyArray<VariableSectorInfo>): VariableSectorInfo {
  const sectorCounts = new Map<string, number>();
  let winner = entries[0] ?? {
    variable: "",
    sector: DEFAULT_SECTOR,
    source: "fallback" as const,
    confidence: "fallback" as const
  };

  entries.forEach((entry) => {
    sectorCounts.set(entry.sector, (sectorCounts.get(entry.sector) ?? 0) + 1);
    if (compareSectorEntries(entry, winner) > 0) {
      winner = entry;
    }
  });

  const accountKind = pickAccountKind(entries);
  const distinctSectorCount = sectorCounts.size;
  const highestCount = Math.max(0, ...sectorCounts.values());
  const highestCountTies = [...sectorCounts.values()].filter((count) => count === highestCount).length;
  const confidence: SectorConfidence =
    winner.source === "fallback"
      ? "fallback"
      : distinctSectorCount <= 1 || highestCount === entries.length
        ? "high"
        : "mixed";
  const sector =
    accountKind === "auxiliary" && highestCountTies > 1 && highestCount > 0
      ? DEFAULT_SECTOR
      : winner.sector;

  return {
    variable: winner.variable,
    sector,
    source: winner.source,
    confidence,
    accountKind
  };
}

function compareSectorEntries(left: VariableSectorInfo, right: VariableSectorInfo): number {
  const sourceRank = rankSource(left.source, left.accountKind) - rankSource(right.source, right.accountKind);
  if (sourceRank !== 0) {
    return sourceRank;
  }

  const kindRank = rankAccountKind(left.accountKind) - rankAccountKind(right.accountKind);
  if (kindRank !== 0) {
    return kindRank;
  }

  return left.sector.localeCompare(right.sector) * -1;
}

function rankSource(source: SectorAssignmentSource, kind?: SectorAccountKind): number {
  if (source === "explicit") {
    return 5;
  }
  if (source === "fallback") {
    return 0;
  }
  if (kind === "stock") {
    return source === "balance-matrix" ? 4 : 3;
  }
  if (kind === "flow") {
    return source === "transaction-matrix" ? 4 : 3;
  }
  return 3;
}

function rankAccountKind(kind?: SectorAccountKind): number {
  switch (kind) {
    case "exogenous":
      return 4;
    case "stock":
      return 3;
    case "flow":
      return 2;
    case "auxiliary":
      return 1;
    default:
      return 0;
  }
}

function pickAccountKind(entries: ReadonlyArray<VariableSectorInfo>): SectorAccountKind | undefined {
  return [...entries]
    .sort((left, right) => rankAccountKind(right.accountKind) - rankAccountKind(left.accountKind))[0]
    ?.accountKind;
}
