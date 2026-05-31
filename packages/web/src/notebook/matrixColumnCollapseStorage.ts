import { useCallback, useEffect, useMemo, useState } from "react";

import {
  collectMatrixAccountSectorCollapseKeys,
  columnCollapseKey,
  isSumColumnLabel,
  usesMatrixAccountColumnLayout,
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
        ids.add(columnCollapseKey(columnIndex));
      }
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

export function readStoredMatrixColumnCollapse(
  storageKey: string,
  validNodeIds: ReadonlySet<string>
): Set<string> {
  if (typeof window === "undefined") {
    return new Set();
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return new Set();
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return new Set();
    }
    return filterMatrixColumnCollapseNodeIds(
      parsed.filter((entry): entry is string => typeof entry === "string"),
      validNodeIds
    );
  } catch {
    return new Set();
  }
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
  const storageKey = useMemo(
    () => matrixColumnCollapseStorageKey(notebookScopeId, cell.id),
    [cell.id, notebookScopeId]
  );
  const collapseAllNodeIds = useMemo(() => {
    const keys = collectMatrixAccountLayoutCollapseKeys(cell);
    return new Set(keys);
  }, [cell.columnBadges, cell.columnTree, cell.sectors]);

  const [collapsedNodeIds, setCollapsedNodeIds] = useState<Set<string>>(() =>
    readStoredMatrixColumnCollapse(storageKey, validNodeIds)
  );

  useEffect(() => {
    setCollapsedNodeIds(readStoredMatrixColumnCollapse(storageKey, validNodeIds));
  }, [storageKey, validNodeIds]);

  useEffect(() => {
    setCollapsedNodeIds((current) => {
      const filtered = filterMatrixColumnCollapseNodeIds(current, validNodeIds);
      if (filtered.size === current.size) {
        let unchanged = true;
        for (const nodeId of filtered) {
          if (!current.has(nodeId)) {
            unchanged = false;
            break;
          }
        }
        if (unchanged) {
          return current;
        }
      }
      return filtered;
    });
  }, [validNodeIds]);

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
