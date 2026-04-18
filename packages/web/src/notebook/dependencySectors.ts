import {
  createSectorTopology,
  mergeSectorTopologies,
  type SectorAccountKind,
  type SectorTopology,
  type VariableSectorInfo
} from "@sfcr/core";

import type { MatrixCell, NotebookCell, SequenceCell } from "./types";
import type { ParsedDependencyGraph } from "./dependencyGraph";
import { resolveNotebookModelKey, resolveRunCellModelKey } from "./modelSections";

export type DependencySectorGroupingMode = "none" | "family";
export type DependencySectorDisplayOccurrenceSign = "+" | "-" | "neutral";

export interface DependencySectorDisplayOccurrence {
  displayLabel: string;
  kind: "direct" | "proxy";
  sector: string;
  sign: DependencySectorDisplayOccurrenceSign;
  sourceCellKey: string;
  sourceExpression: string;
  sourceRowLabel: string;
  variable: string;
}

export type DependencySectorDisplayOccurrences = Record<string, DependencySectorDisplayOccurrence[]>;

export interface ResolvedStripMappingSources {
  transactionMatrix: MatrixCell | null;
  balanceMatrix: MatrixCell | null;
}

const SUM_COLUMN_NAMES = new Set(["sum", "total"]);
const IGNORED_TOKENS = new Set(["d", "dt", "max", "min", "abs", "sqrt", "log", "exp"]);
const EXOGENOUS_SECTOR = "Exogenous";
const UNMAPPED_SECTOR = "Unmapped";
const SECTOR_QUALIFIER_TOKENS = new Set(["current", "capital"]);
const SECTOR_GROUP_WHITELIST = [
  { canonical: "Banks", aliases: ["bank", "banks"] },
  { canonical: "Firms", aliases: ["firm", "firms", "production firm", "production firms"] },
  { canonical: "Government", aliases: ["government", "gov"] },
  { canonical: "Households", aliases: ["household", "households"] },
  { canonical: "Central bank", aliases: ["central bank", "cb"] },
  { canonical: "Treasury", aliases: ["treasury"] }
] as const;

export function buildDependencySectorTopology(args: {
  cells: NotebookCell[];
  dependencyCell: SequenceCell & {
    source: Extract<SequenceCell["source"], { kind: "dependency" }>;
  };
  graph: ParsedDependencyGraph;
}): SectorTopology {
  const sectorGrouping = args.dependencyCell.source.sectorGrouping ?? "none";
  const nodeNames = new Set(args.graph.nodes.map((node) => node.name));
  const nodeKindByName = new Map(
    args.graph.nodes.map((node) => [node.name, mapVariableTypeToAccountKind(node.variableType)])
  );
  const exogenousEntries: VariableSectorInfo[] = args.graph.nodes
    .filter((node) => node.variableType === "exogenous")
    .map((node) => ({
      variable: node.name,
      sector: EXOGENOUS_SECTOR,
      source: "explicit",
      confidence: "high",
      accountKind: "exogenous"
    }));

  const sources = resolveStripMappingSources(args.cells, args.dependencyCell);
  const matrixEntries = [
    ...(sources.transactionMatrix
      ? collectSectorEntriesFromMatrix(sources.transactionMatrix, "transaction-matrix", nodeKindByName)
      : []),
    ...(sources.balanceMatrix
      ? collectSectorEntriesFromMatrix(sources.balanceMatrix, "balance-matrix", nodeKindByName)
      : [])
  ].filter((entry) => nodeNames.has(entry.variable));

  const merged = mergeSectorTopologies([
    createSectorTopology(exogenousEntries),
    createSectorTopology(matrixEntries)
  ]);
  const groupedSectorByOriginalSector = buildGroupedSectorByOriginalSector(matrixEntries, sectorGrouping);

  return createSectorTopology(
    args.graph.nodes.map((node) => ({
      variable: node.name,
      sector:
        groupedSectorByOriginalSector.get(merged.variables[node.name]?.sector ?? "") ??
        merged.variables[node.name]?.sector ??
        UNMAPPED_SECTOR,
      source: merged.variables[node.name]?.source ?? "fallback",
      confidence: merged.variables[node.name]?.confidence ?? "fallback",
      accountKind: mapVariableTypeToAccountKind(node.variableType)
    }))
  );
}

export function buildDependencySectorDisplayOccurrences(args: {
  cells: NotebookCell[];
  dependencyCell: SequenceCell & {
    source: Extract<SequenceCell["source"], { kind: "dependency" }>;
  };
  graph: ParsedDependencyGraph;
}): DependencySectorDisplayOccurrences {
  const sectorGrouping = args.dependencyCell.source.sectorGrouping ?? "none";
  const nodeNames = new Set(args.graph.nodes.map((node) => node.name));
  const nodeKindByName = new Map(
    args.graph.nodes.map((node) => [node.name, mapVariableTypeToAccountKind(node.variableType)])
  );
  const sources = resolveStripMappingSources(args.cells, args.dependencyCell);
  const matrixOccurrences = [
    ...(sources.transactionMatrix
      ? collectDisplaySectorOccurrencesFromMatrix(sources.transactionMatrix, "transaction-matrix", nodeKindByName)
      : []),
    ...(sources.balanceMatrix
      ? collectDisplaySectorOccurrencesFromMatrix(sources.balanceMatrix, "balance-matrix", nodeKindByName)
      : [])
  ].filter((entry) => nodeNames.has(entry.variable));
  const groupedSectorByOriginalSector = buildGroupedSectorByOriginalSector(
    matrixOccurrences.map((entry) => ({
      variable: entry.variable,
      sector: entry.sector,
      source: "fallback",
      confidence: "fallback"
    })),
    sectorGrouping
  );
  const occurrencesByVariable = new Map<string, DependencySectorDisplayOccurrence[]>();
  const seenByVariable = new Map<string, Set<string>>();

  matrixOccurrences.forEach((entry) => {
    const sector = groupedSectorByOriginalSector.get(entry.sector) ?? entry.sector;
    const bucket = occurrencesByVariable.get(entry.variable) ?? [];
    const seen = seenByVariable.get(entry.variable) ?? new Set<string>();
    const occurrenceKey = `${sector}::${entry.sign}`;
    if (!seen.has(occurrenceKey)) {
      bucket.push({ ...entry, sector });
      occurrencesByVariable.set(entry.variable, bucket);
      seen.add(occurrenceKey);
      seenByVariable.set(entry.variable, seen);
    }
  });

  return Object.fromEntries(occurrencesByVariable.entries());
}

export function resolveStripMappingSources(
  cells: NotebookCell[],
  dependencyCell: SequenceCell & {
    source: Extract<SequenceCell["source"], { kind: "dependency" }>;
  }
): ResolvedStripMappingSources {
  const transactionMatrixId = dependencyCell.source.stripMapping?.transactionMatrixCellId?.trim();
  const balanceMatrixId = dependencyCell.source.stripMapping?.balanceMatrixCellId?.trim();

  const explicitTransactionMatrix =
    transactionMatrixId != null
      ? cells.find(
          (cell): cell is MatrixCell => cell.type === "matrix" && cell.id === transactionMatrixId
        ) ?? null
      : null;
  const explicitBalanceMatrix =
    balanceMatrixId != null
      ? cells.find((cell): cell is MatrixCell => cell.type === "matrix" && cell.id === balanceMatrixId) ??
        null
      : null;

  if (explicitTransactionMatrix || explicitBalanceMatrix) {
    return {
      transactionMatrix: explicitTransactionMatrix,
      balanceMatrix: explicitBalanceMatrix
    };
  }

  const dependencyIndex = cells.findIndex((cell) => cell.id === dependencyCell.id);
  const dependencyModelKey = resolveNotebookModelKey(cells, dependencyCell.source);
  const matrixCandidates = cells
    .map((cell, index) => ({ cell, index }))
    .filter((entry): entry is { cell: MatrixCell; index: number } => entry.cell.type === "matrix")
    .filter((entry) => entry.index < dependencyIndex || dependencyIndex < 0)
    .filter((entry) => {
      if (!dependencyModelKey || !entry.cell.sourceRunCellId) {
        return true;
      }
      const runCell = cells.find(
        (cell): cell is Extract<NotebookCell, { type: "run" }> =>
          cell.type === "run" && cell.id === entry.cell.sourceRunCellId
      );
      return runCell ? resolveRunCellModelKey(cells, runCell) === dependencyModelKey : true;
    });

  return {
    transactionMatrix:
      explicitTransactionMatrix ??
      pickBestMatrixCandidate(matrixCandidates, dependencyIndex, "transaction")?.cell ??
      null,
    balanceMatrix:
      explicitBalanceMatrix ??
      pickBestMatrixCandidate(matrixCandidates, dependencyIndex, "balance")?.cell ??
      null
  };
}

function pickBestMatrixCandidate(
  candidates: Array<{ cell: MatrixCell; index: number }>,
  dependencyIndex: number,
  kind: "transaction" | "balance"
): { cell: MatrixCell; index: number } | null {
  const ranked = [...candidates].sort((left, right) => {
    const scoreDelta = scoreMatrixCandidate(right.cell, kind) - scoreMatrixCandidate(left.cell, kind);
    if (scoreDelta !== 0) {
      return scoreDelta;
    }
    const leftDistance = dependencyIndex < 0 ? 0 : Math.abs(dependencyIndex - left.index);
    const rightDistance = dependencyIndex < 0 ? 0 : Math.abs(dependencyIndex - right.index);
    return leftDistance - rightDistance;
  });
  return ranked[0] ?? null;
}

function scoreMatrixCandidate(cell: MatrixCell, kind: "transaction" | "balance"): number {
  const title = cell.title.toLowerCase();
  const labels = cell.rows.map((row) => row.label.toLowerCase()).join(" ");
  let score = 0;

  if (kind === "transaction") {
    if (title.includes("transaction")) {
      score += 6;
    }
    if (title.includes("flow")) {
      score += 3;
    }
    if (labels.includes("wages") || labels.includes("deposits")) {
      score += 2;
    }
  } else {
    if (title.includes("balance")) {
      score += 6;
    }
    if (labels.includes("net worth") || labels.includes("fixed capital") || labels.includes("loans")) {
      score += 2;
    }
  }

  return score;
}

function buildSectorTopologyFromMatrix(
  cell: MatrixCell,
  source: "transaction-matrix" | "balance-matrix",
  nodeKindByName: Map<string, SectorAccountKind>
): SectorTopology {
  return createSectorTopology(collectSectorEntriesFromMatrix(cell, source, nodeKindByName));
}

function collectSectorEntriesFromMatrix(
  cell: MatrixCell,
  source: "transaction-matrix" | "balance-matrix",
  nodeKindByName: Map<string, SectorAccountKind>
): VariableSectorInfo[] {
  const sumColumnIndex = findSumColumnIndex(cell.columns);
  const entries: VariableSectorInfo[] = [];

  cell.rows.forEach((row) => {
    if (row.label.trim().toLowerCase() === "sum") {
      return;
    }

    row.values.forEach((value, columnIndex) => {
      if (columnIndex === sumColumnIndex) {
        return;
      }
      const sector = normalizeSectorName(cell.sectors?.[columnIndex] ?? cell.columns[columnIndex] ?? "");
      if (!sector) {
        return;
      }

      extractVariableNames(value).forEach((variable) => {
        entries.push({
          variable,
          sector,
          source,
          confidence: "high",
          accountKind: nodeKindByName.get(variable)
        });
      });
    });
  });

  return entries;
}

function collectDisplaySectorOccurrencesFromMatrix(
  cell: MatrixCell,
  source: "transaction-matrix" | "balance-matrix",
  nodeKindByName: Map<string, SectorAccountKind>
): DependencySectorDisplayOccurrence[] {
  const sumColumnIndex = findSumColumnIndex(cell.columns);
  const entries: DependencySectorDisplayOccurrence[] = [];

  cell.rows.forEach((row) => {
    if (row.label.trim().toLowerCase() === "sum") {
      return;
    }

    row.values.forEach((value, columnIndex) => {
      if (columnIndex === sumColumnIndex) {
        return;
      }
      const sector = normalizeSectorName(cell.sectors?.[columnIndex] ?? cell.columns[columnIndex] ?? "");
      if (!sector) {
        return;
      }

      extractDisplayVariableOccurrences(value).forEach(({ sign, variable }) => {
        entries.push({
          sign,
          displayLabel: variable,
          kind: "direct",
          variable,
          sector,
          sourceCellKey: `${source}:${row.label}:${sector}:${value.trim()}`,
          sourceExpression: value.trim(),
          sourceRowLabel: row.label
        });
      });
    });
  });

  return entries;
}

function findSumColumnIndex(columns: string[]): number {
  return columns.findIndex((column) => SUM_COLUMN_NAMES.has(column.trim().toLowerCase()));
}

function normalizeSectorName(column: string): string {
  const trimmed = column.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.replace(/_/g, " ").replace(/\s+/g, " ").trim();
}

export function buildGroupedSectorByOriginalSector(
  entries: VariableSectorInfo[],
  mode: DependencySectorGroupingMode
): Map<string, string> {
  if (mode !== "family") {
    return new Map();
  }

  const candidates = new Map<
    string,
    Array<{ originalSector: string; variableFamilies: Set<string>; aliasVariant: boolean }>
  >();

  entries.forEach((entry) => {
    const originalSector = entry.sector;
    const variable = entry.variable;
    if (!originalSector || !variable || originalSector === EXOGENOUS_SECTOR || originalSector === UNMAPPED_SECTOR) {
      return;
    }

    const family = inferWhitelistedSectorFamily(originalSector);
    if (!family) {
      return;
    }

    const bucket = candidates.get(family.canonical) ?? [];
    let sectorEntry = bucket.find((candidate) => candidate.originalSector === originalSector);
    if (!sectorEntry) {
      sectorEntry = {
        originalSector,
        variableFamilies: new Set<string>(),
        aliasVariant: isAliasVariantForSectorFamily(originalSector, family)
      };
      bucket.push(sectorEntry);
      candidates.set(family.canonical, bucket);
    }

    const variableFamily = normalizeVariableFamily(variable);
    if (variableFamily) {
      sectorEntry.variableFamilies.add(variableFamily);
    }
  });

  const groupedSectorByOriginalSector = new Map<string, string>();
  candidates.forEach((sectorsForFamily, canonical) => {
    if (sectorsForFamily.length < 2) {
      return;
    }

    const overlapCounts = new Map<string, number>();
    sectorsForFamily.forEach((sector) => {
      sector.variableFamilies.forEach((family) => {
        overlapCounts.set(family, (overlapCounts.get(family) ?? 0) + 1);
      });
    });

    const hasVariableOverlap = Array.from(overlapCounts.values()).some((count) => count >= 2);
    const hasAliasVariant = sectorsForFamily.some((sector) => sector.aliasVariant);
    if (!hasVariableOverlap && !hasAliasVariant) {
      return;
    }

    sectorsForFamily.forEach((sector) => {
      groupedSectorByOriginalSector.set(sector.originalSector, canonical);
    });
  });

  return groupedSectorByOriginalSector;
}

function inferWhitelistedSectorFamily(
  sector: string
): (typeof SECTOR_GROUP_WHITELIST)[number] | null {
  const normalized = normalizeSectorGroupingKey(sector);
  if (!normalized) {
    return null;
  }

  return (
    SECTOR_GROUP_WHITELIST.find((candidate) =>
      candidate.aliases.some((alias) => normalizeSectorGroupingKey(alias) === normalized)
    ) ?? null
  );
}

function isAliasVariantForSectorFamily(
  sector: string,
  family: (typeof SECTOR_GROUP_WHITELIST)[number]
): boolean {
  return normalizeSectorName(sector).toLowerCase() !== normalizeSectorName(family.canonical).toLowerCase();
}

function normalizeSectorGroupingKey(value: string): string {
  const tokens = value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => !SECTOR_QUALIFIER_TOKENS.has(token));
  return tokens.join(" ");
}

function normalizeVariableFamily(variable: string): string | null {
  let next = variable.replace(/\[[^\]]+\]/g, "");
  if (/^d[A-Z]/.test(next)) {
    next = next.slice(1);
  }
  if (next.length > 1 && /[a-z]$/.test(next)) {
    next = next.slice(0, -1);
  }
  const normalized = next.toLowerCase();
  if (!normalized || IGNORED_TOKENS.has(normalized)) {
    return null;
  }
  return normalized;
}

function extractVariableNames(source: string): string[] {
  const tokens = source.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [];
  return Array.from(
    new Set(tokens.filter((token) => !IGNORED_TOKENS.has(token.toLowerCase())))
  );
}

function extractDisplayVariableOccurrences(
  source: string
): Array<{ sign: DependencySectorDisplayOccurrenceSign; variable: string }> {
  const trimmed = source.trim();
  const sign = trimmed.startsWith("-") ? "-" : trimmed.startsWith("+") ? "+" : "neutral";
  const normalized = trimmed.replace(/^[-+]+\s*/, "");
  const deltaMatch = normalized.match(/^d\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)$/i);
  if (deltaMatch?.[1]) {
    return [{ sign, variable: deltaMatch[1] }];
  }

  const lagMatch = normalized.match(/^lag\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)$/i);
  if (lagMatch?.[1]) {
    return [{ sign, variable: lagMatch[1] }];
  }

  const variableMatch = normalized.match(/^([A-Za-z_][A-Za-z0-9_]*)(?:\s*\[-1\])?$/);
  if (variableMatch?.[1]) {
    return [{ sign, variable: variableMatch[1] }];
  }

  return [];
}

function mapVariableTypeToAccountKind(
  variableType: ParsedDependencyGraph["nodes"][number]["variableType"]
): SectorAccountKind {
  switch (variableType) {
    case "stock":
      return "stock";
    case "flow":
      return "flow";
    case "exogenous":
      return "exogenous";
    default:
      return "auxiliary";
  }
}
