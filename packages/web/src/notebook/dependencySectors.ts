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

export interface ResolvedStripMappingSources {
  transactionMatrix: MatrixCell | null;
  balanceMatrix: MatrixCell | null;
}

const SUM_COLUMN_NAMES = new Set(["sum", "total"]);
const IGNORED_TOKENS = new Set(["d", "dt", "max", "min", "abs", "sqrt", "log", "exp"]);
const EXOGENOUS_SECTOR = "Exogenous";
const UNMAPPED_SECTOR = "Unmapped";

export function buildDependencySectorTopology(args: {
  cells: NotebookCell[];
  dependencyCell: SequenceCell & {
    source: Extract<SequenceCell["source"], { kind: "dependency" }>;
  };
  graph: ParsedDependencyGraph;
}): SectorTopology {
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
  const matrixTopologies = [
    sources.transactionMatrix
      ? buildSectorTopologyFromMatrix(sources.transactionMatrix, "transaction-matrix", nodeKindByName)
      : null,
    sources.balanceMatrix
      ? buildSectorTopologyFromMatrix(sources.balanceMatrix, "balance-matrix", nodeKindByName)
      : null
  ].filter((value): value is SectorTopology => value != null);

  const merged = mergeSectorTopologies([
    createSectorTopology(exogenousEntries),
    ...matrixTopologies
  ]);

  return createSectorTopology(
    args.graph.nodes.map((node) => ({
      variable: node.name,
      sector: merged.variables[node.name]?.sector ?? UNMAPPED_SECTOR,
      source: merged.variables[node.name]?.source ?? "fallback",
      confidence: merged.variables[node.name]?.confidence ?? "fallback",
      accountKind: mapVariableTypeToAccountKind(node.variableType)
    }))
  );
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

  return createSectorTopology(entries);
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

function extractVariableNames(source: string): string[] {
  const tokens = source.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [];
  return Array.from(
    new Set(tokens.filter((token) => !IGNORED_TOKENS.has(token.toLowerCase())))
  );
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
