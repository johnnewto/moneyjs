import {
  coerceUnitMeta,
  normalizeSignature,
  signaturesEqual,
  type BaseDimension,
  type StockFlowKind,
  type UnitMeta,
  type UnitSignature,
  type VariableUnitMetadata
} from "../lib/unitMeta";
import { isRowComment } from "@sfcr/notebook-core";
import { buildVariableUnitMetadata } from "../lib/units";
import { findEquationsCell, findExternalsCell } from "./modelSections";
import {
  classifyMatrixEntrySource,
  type MatrixSimpleVariableReference
} from "./matrixVariableReference";
import { resolveAccountingMatrixKind, type AccountingMatrixKind } from "./validation";
import type { EquationsCell, ExternalsCell, MatrixCell, NotebookCell, RunCell } from "./types";

export interface ProposedMatrixUnitUpdate {
  variable: string;
  targetKind: "equation" | "external";
  cellId: string;
  rowIndex: number;
  proposed: UnitMeta;
  current?: UnitMeta;
  sources: string[];
  isMismatch: boolean;
}

interface VariableTarget {
  targetKind: "equation" | "external";
  cellId: string;
  rowIndex: number;
}

interface PendingProposal {
  proposed: UnitMeta;
  reference: MatrixSimpleVariableReference;
  sources: string[];
}

function isSumLabel(value: string): boolean {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, " ") === "sum";
}

export function resolveModelIdFromSourceRunCell(
  cells: NotebookCell[],
  sourceRunCellId: string | undefined
): string | null {
  if (!sourceRunCellId?.trim()) {
    return null;
  }

  const runCell = cells.find(
    (entry): entry is RunCell => entry.type === "run" && entry.id === sourceRunCellId.trim()
  );
  if (!runCell) {
    return null;
  }

  const modelId = runCell.sourceModelId?.trim();
  return modelId ? modelId : null;
}

function resolveVariableTarget(
  cells: NotebookCell[],
  modelId: string,
  variable: string
): VariableTarget | null {
  const equationsCell = findEquationsCell(cells, modelId);
  if (equationsCell) {
    const rowIndex = equationsCell.equations.findIndex(
      (equation) => !isRowComment(equation) && equation.name.trim() === variable
    );
    if (rowIndex >= 0) {
      return {
        targetKind: "equation",
        cellId: equationsCell.id,
        rowIndex
      };
    }
  }

  const externalsCell = findExternalsCell(cells, modelId);
  if (externalsCell) {
    const rowIndex = externalsCell.externals.findIndex(
      (external) => !isRowComment(external) && external.name.trim() === variable
    );
    if (rowIndex >= 0) {
      return {
        targetKind: "external",
        cellId: externalsCell.id,
        rowIndex
      };
    }
  }

  return null;
}

function resolveBaseStockSignature(current?: UnitMeta): UnitSignature {
  const normalized = coerceUnitMeta(current);
  const signature = normalizeSignature(normalized?.signature);
  const stockDimensions: BaseDimension[] = ["items", "mass", "energy", "pp", "carbon", "money", "time"];

  for (const dimension of stockDimensions) {
    if ((signature[dimension] ?? 0) === 1) {
      return { [dimension]: 1 };
    }
    if ((signature[dimension] ?? 0) !== 0 && dimension !== "money" && dimension !== "time") {
      return { [dimension]: 1 };
    }
  }

  return { money: 1 };
}

function resolveStockFlowKind(
  kind: AccountingMatrixKind,
  reference: MatrixSimpleVariableReference
): StockFlowKind {
  if (kind === "balance-sheet") {
    return "stock";
  }
  if (reference.shape.kind === "diff") {
    return "stock";
  }
  return "flow";
}

export function buildProposedMatrixUnitMeta(
  kind: AccountingMatrixKind,
  reference: MatrixSimpleVariableReference,
  current?: UnitMeta
): UnitMeta {
  const stockFlow = resolveStockFlowKind(kind, reference);
  const baseSignature = resolveBaseStockSignature(current);
  if (stockFlow === "stock") {
    return {
      stockFlow,
      signature: baseSignature
    };
  }

  return {
    stockFlow,
    signature: {
      ...baseSignature,
      time: -1
    }
  };
}

export function unitMetaMatchesProposed(current: UnitMeta | undefined, proposed: UnitMeta): boolean {
  const normalizedCurrent = coerceUnitMeta(current);
  const normalizedProposed = coerceUnitMeta(proposed);
  if (!normalizedCurrent?.stockFlow || !normalizedCurrent.signature) {
    return false;
  }
  if (!normalizedProposed?.stockFlow || !normalizedProposed.signature) {
    return false;
  }

  return (
    normalizedCurrent.stockFlow === normalizedProposed.stockFlow &&
    signaturesEqual(normalizedCurrent.signature, normalizedProposed.signature)
  );
}

function formatMatrixSourceLabel(
  reference: MatrixSimpleVariableReference,
  rowLabel: string,
  columnLabel: string | undefined
): string {
  const location = columnLabel ? `${rowLabel} / ${columnLabel}` : rowLabel;
  if (reference.shape.kind === "diff") {
    return `via d(${reference.variableName}) in ${location}`;
  }
  return location;
}

function mergePendingProposal(
  existing: PendingProposal,
  incoming: PendingProposal
): PendingProposal {
  const proposed =
    incoming.proposed.stockFlow === "stock" && existing.proposed.stockFlow === "flow"
      ? incoming.proposed
      : existing.proposed.stockFlow === "stock" && incoming.proposed.stockFlow === "flow"
        ? existing.proposed
        : incoming.proposed;

  return {
    proposed,
    reference: incoming.reference,
    sources: [...existing.sources, ...incoming.sources]
  };
}

export function collectProposedMatrixUnitUpdates(args: {
  cells: NotebookCell[];
  matrix: MatrixCell;
  modelId: string;
  variableUnitMetadata: VariableUnitMetadata;
}): ProposedMatrixUnitUpdate[] {
  const kind = resolveAccountingMatrixKind(args.matrix);
  if (!kind) {
    return [];
  }

  const sumColumnIndex = args.matrix.columns.findIndex((column) => isSumLabel(column));
  const pending = new Map<string, PendingProposal>();

  args.matrix.rows.forEach((row) => {
    if (isSumLabel(row.label)) {
      return;
    }

    row.values.forEach((value, columnIndex) => {
      if (columnIndex === sumColumnIndex) {
        return;
      }

      const reference = classifyMatrixEntrySource(value);
      if (!reference) {
        return;
      }

      const target = resolveVariableTarget(args.cells, args.modelId, reference.variableName);
      if (!target) {
        return;
      }

      const current = args.variableUnitMetadata.get(reference.variableName);
      const proposed = buildProposedMatrixUnitMeta(kind, reference, current);
      const sourceLabel = formatMatrixSourceLabel(
        reference,
        row.label,
        args.matrix.columns[columnIndex]
      );
      const nextPending: PendingProposal = {
        proposed,
        reference,
        sources: [sourceLabel]
      };

      const existing = pending.get(reference.variableName);
      pending.set(
        reference.variableName,
        existing ? mergePendingProposal(existing, nextPending) : nextPending
      );
    });
  });

  const updates: ProposedMatrixUnitUpdate[] = [];
  for (const [variable, entry] of pending) {
    const target = resolveVariableTarget(args.cells, args.modelId, variable);
    if (!target) {
      continue;
    }

    const current = args.variableUnitMetadata.get(variable);
    updates.push({
      variable,
      targetKind: target.targetKind,
      cellId: target.cellId,
      rowIndex: target.rowIndex,
      proposed: entry.proposed,
      current,
      sources: entry.sources,
      isMismatch: !unitMetaMatchesProposed(current, entry.proposed)
    });
  }

  return updates.sort((left, right) => left.variable.localeCompare(right.variable));
}

export function defaultSelectedMatrixUnitVariables(updates: ProposedMatrixUnitUpdate[]): Set<string> {
  return new Set(updates.filter((update) => update.isMismatch).map((update) => update.variable));
}

export function applyMatrixUnitMetaUpdates(
  cells: NotebookCell[],
  updates: ProposedMatrixUnitUpdate[]
): NotebookCell[] {
  if (updates.length === 0) {
    return cells;
  }

  const updatesByCellId = new Map<string, ProposedMatrixUnitUpdate[]>();
  for (const update of updates) {
    const list = updatesByCellId.get(update.cellId) ?? [];
    list.push(update);
    updatesByCellId.set(update.cellId, list);
  }

  return cells.map((cell) => {
    const cellUpdates = updatesByCellId.get(cell.id);
    if (!cellUpdates?.length) {
      return cell;
    }

    if (cell.type === "equations") {
      return {
        ...cell,
        equations: cell.equations.map((equation, index) => {
          const update = cellUpdates.find((entry) => entry.rowIndex === index);
          return update ? { ...equation, unitMeta: update.proposed } : equation;
        })
      } satisfies EquationsCell;
    }

    if (cell.type === "externals") {
      return {
        ...cell,
        externals: cell.externals.map((external, index) => {
          const update = cellUpdates.find((entry) => entry.rowIndex === index);
          return update ? { ...external, unitMeta: update.proposed } : external;
        })
      } satisfies ExternalsCell;
    }

    return cell;
  });
}

export function buildVariableUnitMetadataForModel(
  cells: NotebookCell[],
  modelId: string
): VariableUnitMetadata {
  return buildVariableUnitMetadata({
    equations: findEquationsCell(cells, modelId)?.equations,
    externals: findExternalsCell(cells, modelId)?.externals
  });
}
