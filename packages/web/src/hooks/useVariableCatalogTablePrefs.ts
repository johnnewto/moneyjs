import { useCallback, useEffect, useState } from "react";

import type { VariableCatalogGroupBy } from "../lib/variableCatalog";
import type {
  ColumnOrderState,
  ColumnSizingState,
  SortingState,
  VisibilityState
} from "@tanstack/react-table";

export const VARIABLE_CATALOG_TABLE_PREFS_STORAGE_KEY = "sfcr.variable-catalog.table-prefs";

export interface VariableCatalogTablePrefs {
  columnOrder: ColumnOrderState;
  columnSizing: ColumnSizingState;
  columnVisibility: VisibilityState;
  groupBy: VariableCatalogGroupBy;
  sorting: SortingState;
}

const DEFAULT_COLUMN_ORDER: ColumnOrderState = [
  "groupKey",
  "name",
  "description",
  "value",
  "variableType",
  "endogenousExogenous",
  "stockFlow",
  "unitText",
  "equationRole",
  "modelTitle",
  "externalKind"
];

const DEFAULT_COLUMN_VISIBILITY: VisibilityState = {
  variableType: false,
  endogenousExogenous: false,
  stockFlow: false,
  unitText: false,
  equationRole: false,
  modelTitle: false,
  externalKind: false
};

const DEFAULT_PREFS: VariableCatalogTablePrefs = {
  columnOrder: DEFAULT_COLUMN_ORDER,
  columnSizing: {
    name: 120,
    description: 160,
    value: 88
  },
  columnVisibility: DEFAULT_COLUMN_VISIBILITY,
  groupBy: "none",
  sorting: [{ id: "name", desc: false }]
};

function readStoredPrefs(): VariableCatalogTablePrefs {
  if (typeof window === "undefined") {
    return DEFAULT_PREFS;
  }

  try {
    const raw = window.localStorage.getItem(VARIABLE_CATALOG_TABLE_PREFS_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_PREFS;
    }

    const parsed = JSON.parse(raw) as Partial<VariableCatalogTablePrefs>;
    return {
      columnOrder: Array.isArray(parsed.columnOrder) ? parsed.columnOrder : DEFAULT_PREFS.columnOrder,
      columnSizing:
        parsed.columnSizing && typeof parsed.columnSizing === "object"
          ? parsed.columnSizing
          : DEFAULT_PREFS.columnSizing,
      columnVisibility:
        parsed.columnVisibility && typeof parsed.columnVisibility === "object"
          ? { ...DEFAULT_COLUMN_VISIBILITY, ...parsed.columnVisibility }
          : DEFAULT_PREFS.columnVisibility,
      groupBy: parsed.groupBy ?? DEFAULT_PREFS.groupBy,
      sorting: Array.isArray(parsed.sorting) ? parsed.sorting : DEFAULT_PREFS.sorting
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function useVariableCatalogTablePrefs() {
  const [prefs, setPrefs] = useState<VariableCatalogTablePrefs>(() => readStoredPrefs());

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(VARIABLE_CATALOG_TABLE_PREFS_STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      // Ignore storage failures.
    }
  }, [prefs]);

  const setColumnOrder = useCallback((columnOrder: ColumnOrderState) => {
    setPrefs((current) => ({ ...current, columnOrder }));
  }, []);

  const setColumnSizing = useCallback((columnSizing: ColumnSizingState) => {
    setPrefs((current) => ({ ...current, columnSizing }));
  }, []);

  const setColumnVisibility = useCallback((columnVisibility: VisibilityState) => {
    setPrefs((current) => ({ ...current, columnVisibility }));
  }, []);

  const setGroupBy = useCallback((groupBy: VariableCatalogGroupBy) => {
    setPrefs((current) => ({ ...current, groupBy }));
  }, []);

  const setSorting = useCallback((sorting: SortingState) => {
    setPrefs((current) => ({ ...current, sorting }));
  }, []);

  return {
    prefs,
    setColumnOrder,
    setColumnSizing,
    setColumnVisibility,
    setGroupBy,
    setSorting
  };
}
