import { useCallback, useEffect, useMemo, useState } from "react";

import { isRowComment, type EquationListItem } from "@sfcr/notebook-core";

export const EQUATION_SECTION_COLLAPSE_STORAGE_PREFIX = "sfcr.equation-section-collapse.";

export function equationSectionCollapseStorageKey(cellId: string): string {
  return `${EQUATION_SECTION_COLLAPSE_STORAGE_PREFIX}${cellId}`;
}

export function sectionCommentHasEquations(
  equations: readonly EquationListItem[],
  commentIndex: number
): boolean {
  for (let index = commentIndex + 1; index < equations.length; index += 1) {
    if (isRowComment(equations[index])) {
      return false;
    }
    return true;
  }
  return false;
}

export function collectCollapsibleSectionCommentIds(
  equations: readonly EquationListItem[],
  sectionBoundaries: ReadonlyMap<string, unknown>
): string[] {
  const ids: string[] = [];
  equations.forEach((row, index) => {
    if (!isRowComment(row) || !sectionBoundaries.has(row.id)) {
      return;
    }
    if (sectionCommentHasEquations(equations, index)) {
      ids.push(row.id);
    }
  });
  return ids;
}

export function isEquationRowHiddenBySectionCollapse(
  equations: readonly EquationListItem[],
  collapsedSectionIds: ReadonlySet<string>,
  rowIndex: number
): boolean {
  const row = equations[rowIndex];
  if (!row || isRowComment(row)) {
    return false;
  }

  for (let index = rowIndex - 1; index >= 0; index -= 1) {
    const prior = equations[index];
    if (isRowComment(prior)) {
      return collapsedSectionIds.has(prior.id);
    }
  }

  return false;
}

function collectSectionCommentIds(equations: readonly EquationListItem[]): Set<string> {
  const ids = new Set<string>();
  equations.forEach((row) => {
    if (isRowComment(row)) {
      ids.add(row.id);
    }
  });
  return ids;
}

function filterCollapsedSectionIds(
  collapsedSectionIds: Iterable<string>,
  validSectionIds: ReadonlySet<string>
): Set<string> {
  const filtered = new Set<string>();
  for (const sectionId of collapsedSectionIds) {
    if (validSectionIds.has(sectionId)) {
      filtered.add(sectionId);
    }
  }
  return filtered;
}

function readStoredCollapsedSectionIds(storageKey: string, validSectionIds: ReadonlySet<string>): Set<string> {
  if (typeof window === "undefined") {
    return new Set();
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return new Set();
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return new Set();
    }
    return filterCollapsedSectionIds(
      parsed.filter((value): value is string => typeof value === "string"),
      validSectionIds
    );
  } catch {
    return new Set();
  }
}

function writeStoredCollapsedSectionIds(storageKey: string, collapsedSectionIds: ReadonlySet<string>): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(storageKey, JSON.stringify([...collapsedSectionIds]));
  } catch {
    // Ignore quota / private-mode failures.
  }
}

export function useEquationSectionCollapseState(
  cellId: string,
  equations: readonly EquationListItem[],
  collapsibleSectionIds: readonly string[] = []
): {
  collapsedSectionIds: Set<string>;
  collapseAllSections(): void;
  expandAllSections(): void;
  hasCollapsibleSections: boolean;
  isSectionCollapsed(sectionId: string): boolean;
  toggleSectionCollapse(sectionId: string): void;
} {
  const collapsibleSectionIdSet = useMemo(
    () => new Set(collapsibleSectionIds),
    [collapsibleSectionIds]
  );
  const validSectionIds = useMemo(() => collectSectionCommentIds(equations), [equations]);
  const validSectionIdsKey = useMemo(() => [...validSectionIds].sort().join("\n"), [validSectionIds]);
  const storageKey = useMemo(() => equationSectionCollapseStorageKey(cellId), [cellId]);
  const [collapsedSectionIds, setCollapsedSectionIds] = useState<Set<string>>(() =>
    readStoredCollapsedSectionIds(storageKey, validSectionIds)
  );

  useEffect(() => {
    setCollapsedSectionIds(readStoredCollapsedSectionIds(storageKey, validSectionIds));
  }, [storageKey, validSectionIdsKey]);

  useEffect(() => {
    setCollapsedSectionIds((current) => {
      const filtered = filterCollapsedSectionIds(current, validSectionIds);
      if (filtered.size === current.size && [...filtered].every((id) => current.has(id))) {
        return current;
      }
      return filtered;
    });
  }, [validSectionIdsKey]);

  useEffect(() => {
    writeStoredCollapsedSectionIds(storageKey, collapsedSectionIds);
  }, [collapsedSectionIds, storageKey]);

  const toggleSectionCollapse = useCallback((sectionId: string) => {
    setCollapsedSectionIds((current) => {
      const next = new Set(current);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  }, []);

  const isSectionCollapsed = useCallback(
    (sectionId: string) => collapsedSectionIds.has(sectionId),
    [collapsedSectionIds]
  );

  const expandAllSections = useCallback(() => {
    setCollapsedSectionIds(new Set());
  }, []);

  const collapseAllSections = useCallback(() => {
    if (collapsibleSectionIdSet.size === 0) {
      return;
    }
    setCollapsedSectionIds(new Set(collapsibleSectionIdSet));
  }, [collapsibleSectionIdSet]);

  return {
    collapsedSectionIds,
    collapseAllSections,
    expandAllSections,
    hasCollapsibleSections: collapsibleSectionIdSet.size > 0,
    isSectionCollapsed,
    toggleSectionCollapse
  };
}
