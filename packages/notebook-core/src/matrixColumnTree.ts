import {
  parseMatrixAccountColumnLeafDisplay,
  type MatrixAccountBadgeRole,
  type MatrixColumnDisplaySlot,
  type MatrixColumnHeaderCell
} from "./matrixAccountColumns";
import type { MatrixColumnTreeNode } from "./types";

export type { MatrixAccountBadgeRole, MatrixColumnDisplaySlot, MatrixColumnHeaderCell };
export { formatMatrixColumnLeafHeaderLabel } from "./matrixAccountColumns";

const MATRIX_COLUMN_TREE_HEADER_ROW_COUNT = 2;

export interface VisibleMatrixColumnLeaf {
  node: MatrixColumnTreeNode;
  columnIndex: number;
  columnName: string;
}

export function isMatrixColumnTreeLeaf(node: MatrixColumnTreeNode): boolean {
  return !node.children || node.children.length === 0;
}

export function resolveMatrixColumnTreeLeafColumnKey(node: MatrixColumnTreeNode): string {
  return node.label.trim();
}

export function resolveMatrixColumnTreeLeafVariable(node: MatrixColumnTreeNode): string {
  return node.variable?.trim() || node.id.trim();
}

/** @deprecated Use resolveMatrixColumnTreeLeafColumnKey or resolveMatrixColumnTreeLeafVariable */
export function resolveMatrixColumnTreeLeafName(node: MatrixColumnTreeNode): string {
  return resolveMatrixColumnTreeLeafVariable(node);
}

export function flattenMatrixColumnTreeLeaves(tree: MatrixColumnTreeNode[]): MatrixColumnTreeNode[] {
  const leaves: MatrixColumnTreeNode[] = [];
  for (const node of tree) {
    if (isMatrixColumnTreeLeaf(node)) {
      leaves.push(node);
      continue;
    }
    leaves.push(...flattenMatrixColumnTreeLeaves(node.children ?? []));
  }
  return leaves;
}

export function matrixColumnTreeMaxDepth(tree: MatrixColumnTreeNode[]): number {
  let maxDepth = 0;
  for (const node of tree) {
    if (isMatrixColumnTreeLeaf(node)) {
      maxDepth = Math.max(maxDepth, 1);
      continue;
    }
    maxDepth = Math.max(maxDepth, 1 + matrixColumnTreeMaxDepth(node.children ?? []));
  }
  return maxDepth;
}

export function collectVisibleMatrixColumnLeaves(
  tree: MatrixColumnTreeNode[],
  columns: string[],
  collapsedNodeIds: ReadonlySet<string>
): VisibleMatrixColumnLeaf[] {
  return buildMatrixColumnDisplaySlots(tree, columns, collapsedNodeIds)
    .filter((slot): slot is Extract<MatrixColumnDisplaySlot, { kind: "leaf" }> => slot.kind === "leaf")
    .map((slot) => {
      const node = findMatrixColumnTreeLeafByColumnIndex(tree, columns, slot.columnIndex);
      const columnName = columns[slot.columnIndex]?.trim() ?? "";
      return { node: node ?? { id: columnName, label: columnName }, columnIndex: slot.columnIndex, columnName };
    });
}

export function classifyMatrixColumnTreeCategoryRole(
  categoryLabel: string
): MatrixAccountBadgeRole | undefined {
  const normalized = categoryLabel.trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (normalized === "assets" || normalized === "asset") {
    return "asset";
  }
  if (normalized === "liabilities" || normalized === "liability") {
    return "liability";
  }
  if (normalized === "equity" || normalized === "networth") {
    return "equity";
  }
  return undefined;
}

export function buildMatrixColumnDisplaySlots(
  tree: MatrixColumnTreeNode[],
  columns: string[],
  collapsedNodeIds: ReadonlySet<string>
): MatrixColumnDisplaySlot[] {
  const slots: MatrixColumnDisplaySlot[] = [];

  function pushLeafSlot(node: MatrixColumnTreeNode, stockRole?: MatrixAccountBadgeRole): void {
    const columnKey = resolveMatrixColumnTreeLeafColumnKey(node);
    const columnIndex = columns.findIndex((column) => column.trim() === columnKey);
    if (columnIndex < 0) {
      return;
    }
    if (collapsedNodeIds.has(node.id)) {
      slots.push({
        kind: "hiddenLeaf",
        nodeId: node.id,
        columnIndex,
        ...(stockRole ? { stockRole } : {})
      });
      return;
    }
    slots.push({ kind: "leaf", columnIndex });
  }

  function walkCategoryNodes(nodes: MatrixColumnTreeNode[], categoryLabel: string): void {
    const stockRole = classifyMatrixColumnTreeCategoryRole(categoryLabel);
    for (const node of nodes) {
      if (isMatrixColumnTreeLeaf(node)) {
        pushLeafSlot(node, stockRole);
        continue;
      }
      if (collapsedNodeIds.has(node.id)) {
        slots.push({ kind: "collapsed", nodeId: node.id, label: node.label });
        continue;
      }
      walkCategoryNodes(node.children ?? [], node.label);
    }
  }

  function walkSectorChildren(nodes: MatrixColumnTreeNode[]): void {
    for (const node of nodes) {
      if (isMatrixColumnTreeLeaf(node)) {
        pushLeafSlot(node);
        continue;
      }
      if (collapsedNodeIds.has(node.id)) {
        slots.push({ kind: "collapsed", nodeId: node.id, label: node.label });
        continue;
      }
      walkCategoryNodes(node.children ?? [], node.label);
    }
  }

  for (const node of tree) {
    if (collapsedNodeIds.has(node.id)) {
      slots.push({ kind: "collapsed", nodeId: node.id, label: node.label });
      continue;
    }
    if (isMatrixColumnTreeLeaf(node)) {
      pushLeafSlot(node);
      continue;
    }
    walkSectorChildren(node.children ?? []);
  }

  return slots;
}

function findMatrixColumnTreeLeafByColumnIndex(
  tree: MatrixColumnTreeNode[],
  columns: string[],
  columnIndex: number
): MatrixColumnTreeNode | undefined {
  const columnLabel = columns[columnIndex]?.trim();
  if (!columnLabel) {
    return undefined;
  }
  return flattenMatrixColumnTreeLeaves(tree).find(
    (node) => resolveMatrixColumnTreeLeafColumnKey(node) === columnLabel
  );
}

export function countMatrixColumnDisplayWidth(
  node: MatrixColumnTreeNode,
  collapsedNodeIds: ReadonlySet<string>
): number {
  if (collapsedNodeIds.has(node.id)) {
    return 1;
  }
  if (isMatrixColumnTreeLeaf(node)) {
    return 1;
  }
  return (node.children ?? []).reduce(
    (total, child) => total + countMatrixColumnDisplayWidth(child, collapsedNodeIds),
    0
  );
}

export function countVisibleMatrixColumnLeaves(
  node: MatrixColumnTreeNode,
  collapsedNodeIds: ReadonlySet<string>
): number {
  return countMatrixColumnDisplayWidth(node, collapsedNodeIds);
}

export function buildMatrixColumnHeaderRows(
  tree: MatrixColumnTreeNode[],
  columns: string[],
  collapsedNodeIds: ReadonlySet<string>
): MatrixColumnHeaderCell[][] {
  const rows: MatrixColumnHeaderCell[][] = Array.from(
    { length: MATRIX_COLUMN_TREE_HEADER_ROW_COUNT },
    () => []
  );

  function pushLeafHeader(
    node: MatrixColumnTreeNode,
    stockRole?: MatrixAccountBadgeRole,
    isLeafHidden = false
  ): void {
    const columnKey = resolveMatrixColumnTreeLeafColumnKey(node);
    const columnIndex = columns.findIndex((column) => column.trim() === columnKey);
    const leafDisplay = parseMatrixAccountColumnLeafDisplay(node.label);
    const variableSymbol = node.variable?.trim() || leafDisplay.variableSymbol;
    rows[1]?.push({
      nodeId: node.id,
      label: leafDisplay.accountName,
      fullLabel: leafDisplay.fullLabel,
      ...(variableSymbol ? { variableSymbol } : {}),
      colSpan: 1,
      rowSpan: 1,
      columnIndex: columnIndex >= 0 ? columnIndex : undefined,
      isLeaf: true,
      isExpandable: false,
      isLeafHidden,
      inspectVariable: resolveMatrixColumnTreeLeafVariable(node),
      ...(stockRole ? { stockRole } : {})
    });
  }

  function walkCategoryNodes(nodes: MatrixColumnTreeNode[], categoryLabel: string): void {
    const stockRole = classifyMatrixColumnTreeCategoryRole(categoryLabel);
    for (const node of nodes) {
      if (isMatrixColumnTreeLeaf(node)) {
        pushLeafHeader(node, stockRole, collapsedNodeIds.has(node.id));
        continue;
      }
      if (collapsedNodeIds.has(node.id)) {
        continue;
      }
      walkCategoryNodes(node.children ?? [], node.label);
    }
  }

  function walkSectorChildren(nodes: MatrixColumnTreeNode[]): void {
    for (const node of nodes) {
      if (isMatrixColumnTreeLeaf(node)) {
        pushLeafHeader(node, undefined, collapsedNodeIds.has(node.id));
        continue;
      }
      if (collapsedNodeIds.has(node.id)) {
        continue;
      }
      walkCategoryNodes(node.children ?? [], node.label);
    }
  }

  for (const node of tree) {
    if (collapsedNodeIds.has(node.id)) {
      rows[0]?.push({
        nodeId: node.id,
        label: node.label,
        colSpan: 1,
        rowSpan: MATRIX_COLUMN_TREE_HEADER_ROW_COUNT,
        isLeaf: false,
        isExpandable: true,
        isCollapsedStub: true
      });
      continue;
    }

    if (isMatrixColumnTreeLeaf(node)) {
      pushLeafHeader(node);
      continue;
    }

    const colSpan = countMatrixColumnDisplayWidth(node, collapsedNodeIds);
    if (colSpan === 0) {
      continue;
    }

    rows[0]?.push({
      nodeId: node.id,
      label: node.label,
      colSpan,
      rowSpan: 1,
      isLeaf: false,
      isExpandable: true
    });
    walkSectorChildren(node.children ?? []);
  }

  return rows;
}

export function validateMatrixColumnTreeMatchesColumns(
  tree: MatrixColumnTreeNode[],
  columns: string[]
): string | null {
  const dataColumns = columns.filter((column) => column.trim().toLowerCase() !== "sum");
  const leafColumnKeys = flattenMatrixColumnTreeLeaves(tree).map((node) =>
    resolveMatrixColumnTreeLeafColumnKey(node)
  );

  if (leafColumnKeys.length !== dataColumns.length) {
    return `columnTree has ${leafColumnKeys.length} leaf accounts but columns has ${dataColumns.length} data columns.`;
  }

  for (let index = 0; index < leafColumnKeys.length; index += 1) {
    if (leafColumnKeys[index] !== dataColumns[index]?.trim()) {
      return `columnTree leaf '${leafColumnKeys[index]}' does not match columns[${index}] '${dataColumns[index]}'.`;
    }
  }

  return null;
}

export function parseMatrixColumnTreeNode(input: unknown): MatrixColumnTreeNode | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }

  const record = input as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.trim() : "";
  const label = typeof record.label === "string" ? record.label.trim() : id;
  if (!id) {
    return null;
  }

  const children = Array.isArray(record.children)
    ? record.children
        .map((child) => parseMatrixColumnTreeNode(child))
        .filter((child): child is MatrixColumnTreeNode => child != null)
    : undefined;

  const variable = typeof record.variable === "string" ? record.variable.trim() : undefined;

  return {
    id,
    label: label || id,
    ...(variable ? { variable } : {}),
    ...(children && children.length > 0 ? { children } : {})
  };
}

export function parseMatrixColumnTree(input: unknown): MatrixColumnTreeNode[] | undefined {
  if (!Array.isArray(input)) {
    return undefined;
  }

  const nodes = input
    .map((entry) => parseMatrixColumnTreeNode(entry))
    .filter((entry): entry is MatrixColumnTreeNode => entry != null);

  return nodes.length > 0 ? nodes : undefined;
}
