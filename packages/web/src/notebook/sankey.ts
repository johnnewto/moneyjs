import { resolveAccountingMatrixKind } from "@sfcr/notebook-core";
import type { SimulationResult } from "@sfcr/core";

import { evaluateMatrixEntryAtPeriod } from "./sequence";
import type { MatrixCell, SankeyCell } from "./types";

export interface SankeyNode {
  id: string;
  label: string;
  layer: number;
  group?: string;
}

export interface SankeyLink {
  sourceId: string;
  targetId: string;
  value: number;
  label?: string;
}

export interface ParsedSankeyDiagram {
  nodes: SankeyNode[];
  links: SankeyLink[];
  errors: string[];
}

const FLOW_EPSILON = 1e-9;

export function resolveSankeyDiagram(
  cell: SankeyCell,
  resolveMatrixCell: (cellId: string) => MatrixCell | null,
  resolveResult: (cellId: string) => SimulationResult | null,
  selectedPeriodIndex: number
): ParsedSankeyDiagram {
  if (cell.source.kind !== "matrix") {
    return {
      nodes: [],
      links: [],
      errors: [`Unsupported sankey source kind '${cell.source.kind}'.`]
    };
  }

  const matrixCell = resolveMatrixCell(cell.source.matrixCellId);
  if (!matrixCell) {
    return {
      nodes: [],
      links: [],
      errors: [`Matrix cell '${cell.source.matrixCellId}' was not found.`]
    };
  }

  const runCellId = cell.source.sourceRunCellId ?? matrixCell.sourceRunCellId;
  const result = runCellId ? resolveResult(runCellId) : null;
  const includeZeroFlows = cell.source.includeZeroFlows ?? false;

  if (isInputOutputMatrix(matrixCell)) {
    return buildSankeyFromIoMatrix(matrixCell, result, selectedPeriodIndex, includeZeroFlows);
  }

  return buildSankeyFromTransactionFlowMatrix(
    matrixCell,
    result,
    selectedPeriodIndex,
    includeZeroFlows
  );
}

export function isInputOutputMatrix(cell: MatrixCell): boolean {
  if (resolveAccountingMatrixKind(cell) === "input-output") {
    return true;
  }

  const hasIntermediateBand = cell.rows.some(
    (row) => row.band?.trim().toLowerCase() === "intermediate"
  );
  const hasFinalDemandColumn = cell.columns.some((column) =>
    /final\s+demand/i.test(column.trim())
  );
  return hasIntermediateBand && hasFinalDemandColumn;
}

/**
 * Auto-generate a three-layer Sankey from a signed transactions-flow matrix,
 * following the `sfcr_sankey()` convention: sector outflows → flow rows → sector inflows.
 */
export function buildSankeyFromTransactionFlowMatrix(
  cell: MatrixCell,
  result: SimulationResult | null,
  selectedPeriodIndex: number,
  includeZeroFlows = false
): ParsedSankeyDiagram {
  const threeIoPcMacroDiagram = buildThreeIoPcMacroTransactionSankey(
    cell,
    result,
    selectedPeriodIndex,
    includeZeroFlows
  );
  if (threeIoPcMacroDiagram) {
    return threeIoPcMacroDiagram;
  }

  const sumColumnIndex = findSumColumnIndex(cell.columns);
  const sectorColumns = cell.columns
    .map((column, index) => ({ column, index }))
    .filter(({ index }) => index !== sumColumnIndex);

  const nodes = new Map<string, SankeyNode>();
  const links: SankeyLink[] = [];
  const errors: string[] = [];

  function ensureNode(id: string, label: string, layer: number, group?: string): string {
    if (!nodes.has(id)) {
      nodes.set(id, { id, label, layer, group });
    }
    return id;
  }

  for (const { column: sectorLabel, index: columnIndex } of sectorColumns) {
    ensureNode(sectorOutId(sectorLabel), sectorLabel, 0, "sector-out");
    ensureNode(sectorInId(sectorLabel), sectorLabel, 2, "sector-in");
  }

  cell.rows.forEach((row) => {
    if (row.label.trim().toLowerCase() === "sum") {
      return;
    }

    const flowLabel = row.label.trim();
    const flowId = ensureNode(flowNodeId(flowLabel), flowLabel, 1, "flow");

    row.values.forEach((source, columnIndex) => {
      if (columnIndex === sumColumnIndex) {
        return;
      }

      const sectorLabel = cell.columns[columnIndex];
      if (!sectorLabel) {
        return;
      }

      const signedValue = resolveSignedMatrixValue(source, result, selectedPeriodIndex);
      if (signedValue == null || !shouldIncludeFlow(includeZeroFlows, signedValue)) {
        return;
      }

      if (signedValue < 0) {
        links.push({
          sourceId: sectorOutId(sectorLabel),
          targetId: flowId,
          value: Math.abs(signedValue),
          label: flowLabel
        });
        return;
      }

      if (signedValue > 0) {
        links.push({
          sourceId: flowId,
          targetId: sectorInId(sectorLabel),
          value: signedValue,
          label: flowLabel
        });
      }
    });
  });

  if (links.length === 0) {
    errors.push("No transaction-flow links were generated for the selected period.");
  }

  return finalizeSankeyDiagram(Array.from(nodes.values()), links, errors);
}

function buildThreeIoPcMacroTransactionSankey(
  cell: MatrixCell,
  result: SimulationResult | null,
  selectedPeriodIndex: number,
  includeZeroFlows: boolean
): ParsedSankeyDiagram | null {
  if (!isThreeIoPcMacroTransactionMatrix(cell)) {
    return null;
  }

  const nodes = new Map<string, SankeyNode>();
  const links: SankeyLink[] = [];
  const errors: string[] = [];

  function ensureNode(id: string, label: string, layer: number, group?: string): string {
    if (!nodes.has(id)) {
      nodes.set(id, { id, label, layer, group });
    }
    return id;
  }

  function addLink(sourceId: string, targetId: string, value: number | null, label?: string): void {
    if (value == null || !shouldIncludeFlow(includeZeroFlows, value)) {
      return;
    }
    links.push({ sourceId, targetId, value: Math.abs(value), label });
  }

  const firmsOut = ensureNode(sectorOutId("Firms"), "Firms", 0, "sector-out");
  const householdsOut = ensureNode(sectorOutId("Households"), "Households", 0, "sector-out");
  const governmentOut = ensureNode(sectorOutId("Government"), "Government", 0, "sector-out");
  const centralBankOut = ensureNode(sectorOutId("Central bank"), "Central bank", 0, "sector-out");

  const firmsIn = ensureNode(sectorInId("Firms"), "Firms", 2, "sector-in");
  const householdsIn = ensureNode(sectorInId("Households"), "Households", 2, "sector-in");
  const governmentIn = ensureNode(sectorInId("Government"), "Government", 2, "sector-in");
  const centralBankIn = ensureNode(sectorInId("Central bank"), "Central bank", 2, "sector-in");

  const incomeFlow = ensureNode(flowNodeId("GDP (income)"), "GDP (income)", 1, "flow");
  const consumptionFlow = ensureNode(flowNodeId("Consumption"), "Consumption", 1, "flow");
  const taxesFlow = ensureNode(flowNodeId("Taxes"), "Taxes", 1, "flow");
  const governmentSpendingFlow = ensureNode(
    flowNodeId("Government expenditure"),
    "Government expenditure",
    1,
    "flow"
  );
  const moneyChangeFlow = ensureNode(flowNodeId("Change in cash"), "Change in cash", 1, "flow");
  const interestFlow = ensureNode(
    flowNodeId("Interest payments"),
    "Interest payments",
    1,
    "flow"
  );
  const billsChangeFlow = ensureNode(flowNodeId("Change in bills"), "Change in bills", 1, "flow");

  const consumption = matrixMagnitude(cell, "Consumption", "Households", result, selectedPeriodIndex);
  const governmentSpending = matrixMagnitude(
    cell,
    "Government expenditure",
    "Government",
    result,
    selectedPeriodIndex
  );
  const income =
    matrixMagnitude(cell, "GDP (income)", "Firms", result, selectedPeriodIndex) ??
    sumNullableValues([consumption, governmentSpending]);
  const taxes = matrixMagnitude(cell, "Taxes", "Households", result, selectedPeriodIndex);
  const moneyChange = matrixMagnitude(cell, "Change in cash", "Households", result, selectedPeriodIndex);
  const householdInterest = matrixMagnitude(
    cell,
    "Interest payments",
    "Households",
    result,
    selectedPeriodIndex
  );
  const householdBillsChange = matrixMagnitude(
    cell,
    "Change in bills",
    "Households",
    result,
    selectedPeriodIndex
  );
  const centralBankBillsChange = matrixMagnitude(
    cell,
    "Change in bills",
    "Central bank",
    result,
    selectedPeriodIndex
  );
  const governmentBillsChange = matrixMagnitude(
    cell,
    "Change in bills",
    "Government",
    result,
    selectedPeriodIndex
  );

  addLink(firmsOut, incomeFlow, income, "GDP (income)");
  addLink(incomeFlow, householdsIn, income, "GDP (income)");
  addLink(householdsOut, consumptionFlow, consumption, "Consumption");
  addLink(consumptionFlow, firmsIn, consumption, "Consumption");
  addLink(householdsOut, taxesFlow, taxes, "Taxes");
  addLink(taxesFlow, governmentIn, taxes, "Taxes");
  addLink(householdsOut, moneyChangeFlow, moneyChange, "Change in cash");
  addLink(moneyChangeFlow, centralBankIn, moneyChange, "Change in cash");
  addLink(governmentOut, governmentSpendingFlow, governmentSpending, "Government expenditure");
  addLink(governmentSpendingFlow, firmsIn, governmentSpending, "Government expenditure");
  addLink(governmentOut, interestFlow, householdInterest, "Interest payments");
  addLink(interestFlow, householdsIn, householdInterest, "Interest payments");
  addLink(householdsOut, billsChangeFlow, householdBillsChange, "Change in bills");
  addLink(centralBankOut, billsChangeFlow, centralBankBillsChange, "Change in bills");
  addLink(billsChangeFlow, governmentIn, governmentBillsChange, "Change in bills");

  if (links.length === 0) {
    errors.push("No transaction-flow links were generated for the selected period.");
  }

  return finalizeSankeyDiagram(Array.from(nodes.values()), links, errors);
}

/**
 * Auto-generate a three-layer IO Sankey: industry output → product market → inputs / final demand.
 */
export function buildSankeyFromIoMatrix(
  cell: MatrixCell,
  result: SimulationResult | null,
  selectedPeriodIndex: number,
  includeZeroFlows = false
): ParsedSankeyDiagram {
  const sumColumnIndex = findSumColumnIndex(cell.columns);
  const finalDemandColumnIndex = cell.columns.findIndex((column) =>
    /final\s+demand/i.test(column.trim())
  );
  const outputColumnIndex = cell.columns.findIndex((column) => column.trim().toLowerCase() === "output");

  const excludedColumnIndices = new Set<number>(
    [sumColumnIndex, finalDemandColumnIndex, outputColumnIndex].filter((index) => index >= 0)
  );
  const demandColumnIndices = cell.columns
    .map((_, index) => index)
    .filter((index) => !excludedColumnIndices.has(index));

  const intermediateRows = cell.rows.filter(
    (row) =>
      row.band?.trim().toLowerCase() === "intermediate" &&
      row.label.trim().toLowerCase() !== "sum"
  );
  const outputRow = cell.rows.find(
    (row) =>
      row.band?.trim().toLowerCase() === "output" || row.label.trim().toLowerCase() === "output"
  );

  const nodes = new Map<string, SankeyNode>();
  const links: SankeyLink[] = [];
  const errors: string[] = [];

  function ensureNode(id: string, label: string, layer: number, group?: string): string {
    if (!nodes.has(id)) {
      nodes.set(id, { id, label, layer, group });
    }
    return id;
  }

  for (const columnIndex of demandColumnIndices) {
    const columnLabel = cell.columns[columnIndex] ?? `Industry ${columnIndex + 1}`;
    ensureNode(inputNodeId(columnIndex), `${columnLabel} inputs`, 2, "inputs");
  }

  intermediateRows.forEach((row, rowIndex) => {
    const productLabel = row.label.trim();
    const outputNode = ensureNode(
      outputNodeId(rowIndex),
      `${productLabel} output`,
      0,
      "output"
    );
    const marketNode = ensureNode(
      marketNodeId(rowIndex),
      `Market: ${productLabel}`,
      1,
      "market"
    );
    const finalDemandNode = ensureNode(
      finalDemandNodeId(rowIndex),
      `Final demand: ${productLabel}`,
      2,
      "final-demand"
    );

    const outputColumnForRow = demandColumnIndices[rowIndex];
    let grossOutputValue: number | null = null;
    if (outputRow && outputColumnForRow != null) {
      grossOutputValue = evaluateMatrixEntryAtPeriod(
        outputRow.values[outputColumnForRow] ?? "",
        result,
        selectedPeriodIndex
      );
    }
    if (grossOutputValue == null) {
      grossOutputValue = sumRowValues(
        row.values,
        [...demandColumnIndices, finalDemandColumnIndex].filter((index) => index >= 0),
        result,
        selectedPeriodIndex
      );
    }

    if (grossOutputValue != null && shouldIncludeFlow(includeZeroFlows, grossOutputValue)) {
      links.push({
        sourceId: outputNode,
        targetId: marketNode,
        value: Math.abs(grossOutputValue)
      });
    }

    for (const columnIndex of demandColumnIndices) {
      const value = evaluateMatrixEntryAtPeriod(
        row.values[columnIndex] ?? "",
        result,
        selectedPeriodIndex
      );
      if (value == null || !shouldIncludeFlow(includeZeroFlows, value)) {
        continue;
      }
      links.push({
        sourceId: marketNode,
        targetId: inputNodeId(columnIndex),
        value: Math.abs(value)
      });
    }

    if (finalDemandColumnIndex >= 0) {
      const finalDemandValue = evaluateMatrixEntryAtPeriod(
        row.values[finalDemandColumnIndex] ?? "",
        result,
        selectedPeriodIndex
      );
      if (finalDemandValue != null && shouldIncludeFlow(includeZeroFlows, finalDemandValue)) {
        links.push({
          sourceId: marketNode,
          targetId: finalDemandNode,
          value: Math.abs(finalDemandValue)
        });
      }
    }
  });

  if (intermediateRows.length === 0) {
    errors.push("Input-output matrix has no Intermediate rows to build an IO Sankey.");
  } else if (links.length === 0) {
    errors.push("No input-output links were generated for the selected period.");
  }

  return finalizeSankeyDiagram(Array.from(nodes.values()), links, errors);
}

/** d3-sankey stacks incoming and outgoing ribbons from the same node origin; intermediate nodes must balance. */
export function balanceSankeyIntermediateNodes(
  nodes: SankeyNode[],
  links: SankeyLink[]
): SankeyLink[] {
  const intermediateIds = new Set(
    nodes
      .filter((node) => node.group === "flow" || node.group === "market")
      .map((node) => node.id)
  );
  if (intermediateIds.size === 0) {
    return links;
  }

  const balanced = links.map((link) => ({ ...link }));

  for (const nodeId of intermediateIds) {
    const incoming = balanced.filter((link) => link.targetId === nodeId);
    const outgoing = balanced.filter((link) => link.sourceId === nodeId);
    const inSum = sumLinkValues(incoming);
    const outSum = sumLinkValues(outgoing);

    if (inSum <= FLOW_EPSILON || outSum <= FLOW_EPSILON) {
      continue;
    }

    const imbalance = Math.abs(inSum - outSum);
    if (imbalance <= FLOW_EPSILON * Math.max(inSum, outSum, 1)) {
      continue;
    }

    const scale = inSum / outSum;
    for (const link of outgoing) {
      link.value *= scale;
    }
  }

  return balanced;
}

export function pruneUnusedSankeyNodes(
  nodes: SankeyNode[],
  links: SankeyLink[]
): { nodes: SankeyNode[]; links: SankeyLink[] } {
  const usedNodeIds = new Set<string>();
  for (const link of links) {
    usedNodeIds.add(link.sourceId);
    usedNodeIds.add(link.targetId);
  }

  return {
    nodes: nodes.filter((node) => usedNodeIds.has(node.id)),
    links
  };
}

function finalizeSankeyDiagram(
  nodes: SankeyNode[],
  links: SankeyLink[],
  errors: string[]
): ParsedSankeyDiagram {
  const balancedLinks = balanceSankeyIntermediateNodes(nodes, links);
  const pruned = pruneUnusedSankeyNodes(nodes, balancedLinks);
  return {
    nodes: pruned.nodes,
    links: pruned.links,
    errors
  };
}

function sumLinkValues(links: SankeyLink[]): number {
  return links.reduce((total, link) => total + link.value, 0);
}

function sumRowValues(
  values: string[],
  columnIndices: number[],
  result: SimulationResult | null,
  selectedPeriodIndex: number
): number | null {
  let total = 0;
  let seen = false;

  for (const columnIndex of columnIndices) {
    const value = evaluateMatrixEntryAtPeriod(values[columnIndex] ?? "", result, selectedPeriodIndex);
    if (value == null || !Number.isFinite(value)) {
      continue;
    }
    total += value;
    seen = true;
  }

  return seen ? total : null;
}

function sumNullableValues(values: Array<number | null>): number | null {
  let total = 0;
  let seen = false;

  for (const value of values) {
    if (value == null || !Number.isFinite(value)) {
      continue;
    }
    total += value;
    seen = true;
  }

  return seen ? total : null;
}

function matrixMagnitude(
  cell: MatrixCell,
  rowLabel: string,
  columnLabel: string,
  result: SimulationResult | null,
  selectedPeriodIndex: number
): number | null {
  const row = cell.rows.find((candidate) => candidate.label.trim() === rowLabel);
  const columnIndex = cell.columns.findIndex((candidate) => candidate.trim() === columnLabel);
  if (!row || columnIndex < 0) {
    return null;
  }

  const signedValue = resolveSignedMatrixValue(
    row.values[columnIndex] ?? "",
    result,
    selectedPeriodIndex
  );
  return signedValue == null ? null : Math.abs(signedValue);
}

function isThreeIoPcMacroTransactionMatrix(cell: MatrixCell): boolean {
  if (resolveAccountingMatrixKind(cell) !== "transaction-flow") {
    return false;
  }

  const nonSumColumns = cell.columns
    .filter((column) => column.trim().toLowerCase() !== "sum")
    .map((column) => column.trim());
  if (!sameStringSet(nonSumColumns, ["Households", "Firms", "Central bank", "Government"])) {
    return false;
  }

  const rowLabels = cell.rows.map((row) => row.label.trim());
  return sameStringSet(rowLabels, [
    "Consumption",
    "Government expenditure",
    "GDP (income)",
    "Interest payments",
    "CB profit",
    "Taxes",
    "Change in cash",
    "Change in bills",
    "Sum"
  ]);
}

function sameStringSet(values: string[], expected: string[]): boolean {
  const valueSet = new Set(values);
  if (valueSet.size !== expected.length) {
    return false;
  }
  return expected.every((value) => valueSet.has(value));
}

function resolveSignedMatrixValue(
  source: string,
  result: SimulationResult | null,
  selectedPeriodIndex: number
): number | null {
  const normalized = source.trim();
  if (!normalized) {
    return null;
  }

  const direction = inferMatrixDirection(normalized);
  const evaluated = evaluateMatrixEntryAtPeriod(normalized, result, selectedPeriodIndex);
  if (evaluated != null && Number.isFinite(evaluated)) {
    if (direction === -1) {
      return evaluated > 0 ? -evaluated : evaluated;
    }
    if (direction === 1) {
      return evaluated < 0 ? -evaluated : evaluated;
    }
    return evaluated;
  }

  if (direction === -1 || direction === 1) {
    return direction;
  }

  return null;
}

function inferMatrixDirection(source: string): -1 | 0 | 1 | null {
  const normalized = source.trim();
  if (!normalized) {
    return null;
  }
  if (normalized === "0") {
    return 0;
  }
  if (normalized.startsWith("+")) {
    return 1;
  }
  if (normalized.startsWith("-")) {
    return -1;
  }
  const numeric = Number(normalized);
  if (Number.isFinite(numeric)) {
    if (numeric < 0) {
      return -1;
    }
    if (numeric > 0) {
      return 1;
    }
    return 0;
  }
  return null;
}

function findSumColumnIndex(columns: string[]): number {
  return columns.findIndex((column) => column.trim().toLowerCase() === "sum");
}

function shouldIncludeFlow(includeZeroFlows: boolean, value: number): boolean {
  if (includeZeroFlows) {
    return Number.isFinite(value);
  }
  return Number.isFinite(value) && Math.abs(value) > FLOW_EPSILON;
}

function sectorOutId(label: string): string {
  return `sector-out:${label}`;
}

function sectorInId(label: string): string {
  return `sector-in:${label}`;
}

function flowNodeId(label: string): string {
  return `flow:${label}`;
}

function outputNodeId(rowIndex: number): string {
  return `io-output:${rowIndex}`;
}

function marketNodeId(rowIndex: number): string {
  return `io-market:${rowIndex}`;
}

function inputNodeId(columnIndex: number): string {
  return `io-inputs:${columnIndex}`;
}

function finalDemandNodeId(rowIndex: number): string {
  return `io-final-demand:${rowIndex}`;
}
