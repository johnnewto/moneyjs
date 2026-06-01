import { useCallback, useEffect, useMemo, useState } from "react";

import {
  collectMatrixAccountSectorCollapseKeys,
  columnCollapseKey,
  isSumColumnLabel,
  migrateLegacyColumnCollapseNodeId,
  serializeMatrixColumnCollapseNodeIds,
  usesMatrixAccountColumnLayout,
  usesMatrixSectorColumnLayout,
  type MatrixColumnTreeNode
} from "@sfcr/notebook-core";

import { collectMatrixAccountLayoutCollapseKeys } from "./components/MatrixColumnTreeHeader";
import type { MatrixCell } from "./types";

export const MATRIX_COLUMN_COLLAPSE_STORAGE_PREFIX = "sfcr.matrix-column-collapse.";

export function matrixColumnCollapseStorageKey(notebookScopeId: string, matrixCellId: string): string {
  return `${MATRIX_COLUMN_COLLAPSE_STORAGE_PREFIX}${notebookScopeId}.${matrixCellId}`;
}

function collectColumnTreeNodeIds(tree: MatrixColumnTreeNode[]): string[] {
  const ids: string[] = [];
  const walk = (nodes: MatrixColumnTreeNode[]): void => {
    for (const node of nodes) {
      ids.push(node.id);
      if (node.children && node.children.length > 0) {
        walk(node.children);
      }
    }
  };
  walk(tree);
  return ids;
}

export function collectMatrixColumnCollapseNodeIds(
  cell: Pick<MatrixCell, "columns" | "columnTree" | "sectors" | "columnBadges">
): ReadonlySet<string> {
  const ids = new Set<string>();

  if (usesMatrixAccountColumnLayout(cell.columnBadges)) {
    for (const nodeId of collectMatrixAccountSectorCollapseKeys(cell.sectors)) {
      ids.add(nodeId);
    }
    for (let columnIndex = 0; columnIndex < cell.columns.length; columnIndex += 1) {
      const columnLabel = cell.columns[columnIndex]?.trim() ?? "";
      if (!isSumColumnLabel(columnLabel)) {
        ids.add(columnCollapseKey(columnIndex, cell.columns, cell.sectors));
      }
    }
    return ids;
  }

  if (
    usesMatrixSectorColumnLayout(cell.columns, cell.sectors, cell.columnBadges, cell.columnTree)
  ) {
    for (const nodeId of collectMatrixAccountSectorCollapseKeys(cell.sectors)) {
      ids.add(nodeId);
    }
    return ids;
  }

  if (cell.columnTree && cell.columnTree.length > 0) {
    for (const nodeId of collectColumnTreeNodeIds(cell.columnTree)) {
      ids.add(nodeId);
    }
  }

  return ids;
}

export function filterMatrixColumnCollapseNodeIds(
  nodeIds: Iterable<string>,
  validNodeIds: ReadonlySet<string>
): Set<string> {
  const filtered = new Set<string>();
  for (const nodeId of nodeIds) {
    if (validNodeIds.has(nodeId)) {
      filtered.add(nodeId);
    }
  }
  return filtered;
}

export function normalizeMatrixColumnCollapseNodeIds(
  nodeIds: Iterable<string>,
  validNodeIds: ReadonlySet<string>,
  columns: readonly string[],
  sectors?: readonly string[]
): Set<string> {
  const filtered = new Set<string>();
  for (const nodeId of nodeIds) {
    const migrated = migrateLegacyColumnCollapseNodeId(nodeId, columns, sectors);
    if (validNodeIds.has(migrated)) {
      filtered.add(migrated);
      continue;
    }
    if (validNodeIds.has(nodeId)) {
      filtered.add(nodeId);
    }
  }
  return filtered;
}

function readStoredMatrixColumnCollapseRaw(storageKey: string): string[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((entry): entry is string => typeof entry === "string");
  } catch {
    return [];
  }
}

export function readStoredMatrixColumnCollapse(
  storageKey: string,
  validNodeIds: ReadonlySet<string>,
  columns: readonly string[],
  sectors?: readonly string[]
): Set<string> {
  return normalizeMatrixColumnCollapseNodeIds(
    readStoredMatrixColumnCollapseRaw(storageKey),
    validNodeIds,
    columns,
    sectors
  );
}

export function writeStoredMatrixColumnCollapse(storageKey: string, nodeIds: ReadonlySet<string>): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(storageKey, JSON.stringify([...nodeIds]));
  } catch {
    // Ignore quota / private-mode failures.
  }
}

function collapseNodeIdSetsEqual(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  if (left.size !== right.size) {
    return false;
  }
  for (const nodeId of left) {
    if (!right.has(nodeId)) {
      return false;
    }
  }
  return true;
}

export function useMatrixColumnCollapseState(
  notebookScopeId: string,
  cell: Pick<MatrixCell, "id" | "columns" | "columnTree" | "sectors" | "columnBadges">
): {
  collapsedNodeIds: Set<string>;
  toggleColumnTreeNode(nodeId: string): void;
  expandAllColumnTreeNodes(): void;
  collapseAllColumnTreeNodes(): void;
} {
  const validNodeIds = useMemo(
    () => collectMatrixColumnCollapseNodeIds(cell),
    [cell.columnBadges, cell.columnTree, cell.columns, cell.sectors]
  );
  const validNodeIdsKey = useMemo(
    () => serializeMatrixColumnCollapseNodeIds(validNodeIds),
    [validNodeIds]
  );
  const storageKey = useMemo(
    () => matrixColumnCollapseStorageKey(notebookScopeId, cell.id),
    [cell.id, notebookScopeId]
  );
  const collapseAllNodeIds = useMemo(() => {
    const keys = collectMatrixAccountLayoutCollapseKeys(cell);
    return new Set(keys);
  }, [cell.columnBadges, cell.columnTree, cell.columns, cell.sectors]);

  const [collapsedNodeIds, setCollapsedNodeIds] = useState<Set<string>>(() =>
    readStoredMatrixColumnCollapse(storageKey, validNodeIds, cell.columns, cell.sectors)
  );

  useEffect(() => {
    setCollapsedNodeIds(
      readStoredMatrixColumnCollapse(storageKey, validNodeIds, cell.columns, cell.sectors)
    );
  }, [storageKey, validNodeIdsKey]);

  useEffect(() => {
    setCollapsedNodeIds((current) => {
      const filtered = normalizeMatrixColumnCollapseNodeIds(
        current,
        validNodeIds,
        cell.columns,
        cell.sectors
      );
      if (collapseNodeIdSetsEqual(filtered, current)) {
        return current;
      }
      return filtered;
    });
  }, [validNodeIdsKey]);

  useEffect(() => {
    writeStoredMatrixColumnCollapse(storageKey, collapsedNodeIds);
  }, [collapsedNodeIds, storageKey]);

  const toggleColumnTreeNode = useCallback((nodeId: string) => {
    if (!validNodeIds.has(nodeId)) {
      return;
    }
    setCollapsedNodeIds((current) => {
      const next = new Set(current);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, [validNodeIds]);

  const expandAllColumnTreeNodes = useCallback(() => {
    setCollapsedNodeIds(new Set());
  }, []);

  const collapseAllColumnTreeNodes = useCallback(() => {
    if (collapseAllNodeIds.size === 0) {
      return;
    }
    setCollapsedNodeIds(new Set(collapseAllNodeIds));
  }, [collapseAllNodeIds]);

  return {
    collapsedNodeIds,
    toggleColumnTreeNode,
    expandAllColumnTreeNodes,
    collapseAllColumnTreeNodes
  };
}
