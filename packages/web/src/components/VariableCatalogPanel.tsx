import {
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getFilteredRowModel,
  getGroupedRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type Row,
  type Table,
  type VisibilityState
} from "@tanstack/react-table";
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefObject
} from "react";

import { useVariableCatalogTablePrefs } from "../hooks/useVariableCatalogTablePrefs";
import {
  catalogRowGroupKey,
  type VariableCatalogGroupBy,
  type VariableCatalogRow
} from "../lib/variableCatalog";
import type { VariableUnitMetadata } from "../lib/unitMeta";
import { NumericValueText } from "./NumericValueText";
import { VariableMathLabel } from "./VariableMathLabel";

const CORE_ROW_MODEL = getCoreRowModel();
const EXPANDED_ROW_MODEL = getExpandedRowModel();
const FILTERED_ROW_MODEL = getFilteredRowModel();
const GROUPED_ROW_MODEL = getGroupedRowModel();
const SORTED_ROW_MODEL = getSortedRowModel();

interface VariableCatalogTableRow extends VariableCatalogRow {
  groupKey: string;
}

interface VariableCatalogPanelProps {
  onSelectRow(row: VariableCatalogRow): void;
  rows: VariableCatalogRow[];
  selectedVariable?: string | null;
  showModelColumn?: boolean;
  variableUnitMetadata?: VariableUnitMetadata;
}

const GROUP_BY_OPTIONS: Array<{ value: VariableCatalogGroupBy; label: string }> = [
  { value: "none", label: "None" },
  { value: "endogenousExogenous", label: "Endogenous / Exogenous" },
  { value: "variableType", label: "Type" },
  { value: "stockFlow", label: "Stock / Flow" },
  { value: "unit", label: "Unit" },
  { value: "equationRole", label: "Equation role" },
  { value: "model", label: "Model" }
];

const OPTIONAL_COLUMN_IDS = [
  "variableType",
  "endogenousExogenous",
  "stockFlow",
  "unitText",
  "equationRole",
  "modelTitle",
  "externalKind"
] as const;

const OPTIONAL_COLUMN_LABELS: Record<(typeof OPTIONAL_COLUMN_IDS)[number], string> = {
  variableType: "Type",
  endogenousExogenous: "Role",
  stockFlow: "Stock / Flow",
  unitText: "Unit",
  equationRole: "Equation role",
  modelTitle: "Model",
  externalKind: "External kind"
};

function formatVariableType(value: VariableCatalogRow["variableType"]): string {
  if (!value) {
    return "Unknown";
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatEndogenousExogenous(value: VariableCatalogRow["endogenousExogenous"]): string {
  switch (value) {
    case "endogenous":
      return "Endogenous";
    case "exogenous":
      return "Exogenous";
    case "initial-only":
      return "Initial condition";
    default:
      return "Unknown";
  }
}

function formatEquationRole(value: VariableCatalogRow["equationRole"]): string {
  if (!value) {
    return "";
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function reorderColumnOrder(order: string[], sourceColumnId: string, targetColumnId: string): string[] {
  const next = order.filter((columnId) => columnId !== sourceColumnId);
  const targetIndex = next.indexOf(targetColumnId);
  if (targetIndex < 0) {
    return [...next, sourceColumnId];
  }
  next.splice(targetIndex, 0, sourceColumnId);
  return next;
}

function extractOptionalVisibility(visibility: VisibilityState): VisibilityState {
  return Object.fromEntries(
    OPTIONAL_COLUMN_IDS.filter((columnId) => columnId in visibility).map((columnId) => [
      columnId,
      visibility[columnId]
    ])
  );
}

function buildInitialColumnVisibility(
  prefsVisibility: VisibilityState,
  showModelColumn: boolean
): VisibilityState {
  return {
    name: true,
    description: true,
    value: true,
    groupKey: false,
    modelTitle: showModelColumn ? prefsVisibility.modelTitle !== false : false,
    ...extractOptionalVisibility(prefsVisibility)
  };
}

export function VariableCatalogPanel({
  onSelectRow,
  rows,
  selectedVariable = null,
  showModelColumn = false,
  variableUnitMetadata
}: VariableCatalogPanelProps) {
  const {
    prefs,
    setColumnOrder,
    setColumnSizing,
    setColumnVisibility,
    setGroupBy,
    setSorting
  } = useVariableCatalogTablePrefs();
  const [globalFilter, setGlobalFilter] = useState("");
  const [focusedRowIndex, setFocusedRowIndex] = useState(0);
  const [draggingColumnId, setDraggingColumnId] = useState<string | null>(null);
  const [columnsMenuOpen, setColumnsMenuOpen] = useState(false);
  const tableShellRef = useRef<HTMLDivElement | null>(null);
  const initialColumnVisibilityRef = useRef(
    buildInitialColumnVisibility(prefs.columnVisibility, showModelColumn)
  );

  const tableRows = useMemo<VariableCatalogTableRow[]>(
    () =>
      rows.map((row) => ({
        ...row,
        groupKey: catalogRowGroupKey(row, prefs.groupBy)
      })),
    [prefs.groupBy, rows]
  );

  const columns = useMemo<Array<ColumnDef<VariableCatalogTableRow>>>(
    () => [
      {
        accessorKey: "groupKey",
        enableGrouping: true,
        enableHiding: true,
        header: "Group",
        id: "groupKey"
      },
      {
        accessorKey: "name",
        cell: ({ row }) => <VariableMathLabel name={row.original.name} />,
        header: "Name",
        id: "name",
        minSize: 96,
        size: prefs.columnSizing.name ?? 120
      },
      {
        accessorKey: "description",
        cell: ({ row }) => row.original.description ?? "",
        header: "Description",
        id: "description",
        minSize: 96,
        size: prefs.columnSizing.description ?? 160
      },
      {
        accessorKey: "value",
        cell: ({ row }) =>
          row.original.value == null ? (
            "—"
          ) : (
            <NumericValueText
              unitMeta={variableUnitMetadata?.get(row.original.name)}
              value={row.original.value}
              options={{ maximumFractionDigits: 6 }}
            />
          ),
        header: "Value",
        id: "value",
        minSize: 72,
        size: prefs.columnSizing.value ?? 88,
        sortingFn: "alphanumeric"
      },
      {
        accessorKey: "variableType",
        cell: ({ row }) => formatVariableType(row.original.variableType),
        header: "Type",
        id: "variableType"
      },
      {
        accessorKey: "endogenousExogenous",
        cell: ({ row }) => formatEndogenousExogenous(row.original.endogenousExogenous),
        header: "Role",
        id: "endogenousExogenous"
      },
      {
        accessorKey: "stockFlow",
        cell: ({ row }) => row.original.stockFlow ?? "",
        header: "Stock / Flow",
        id: "stockFlow"
      },
      {
        accessorKey: "unitText",
        cell: ({ row }) => row.original.unitText ?? "",
        header: "Unit",
        id: "unitText"
      },
      {
        accessorKey: "equationRole",
        cell: ({ row }) => formatEquationRole(row.original.equationRole),
        header: "Equation role",
        id: "equationRole"
      },
      {
        accessorKey: "modelTitle",
        cell: ({ row }) => row.original.modelTitle,
        header: "Model",
        id: "modelTitle"
      },
      {
        accessorKey: "externalKind",
        cell: ({ row }) => row.original.externalKind ?? "",
        header: "External kind",
        id: "externalKind"
      }
    ],
    [prefs.columnSizing.description, prefs.columnSizing.name, prefs.columnSizing.value, variableUnitMetadata]
  );

  const table = useReactTable({
    columns,
    data: tableRows,
    autoResetAll: false,
    columnResizeMode: "onEnd",
    enableColumnResizing: true,
    getCoreRowModel: CORE_ROW_MODEL,
    getExpandedRowModel: EXPANDED_ROW_MODEL,
    getFilteredRowModel: FILTERED_ROW_MODEL,
    getGroupedRowModel: GROUPED_ROW_MODEL,
    getSortedRowModel: SORTED_ROW_MODEL,
    globalFilterFn: (row, _columnId, filterValue) => {
      const query = String(filterValue).trim().toLowerCase();
      if (!query) {
        return true;
      }
      const name = row.original.name.toLowerCase();
      const description = row.original.description?.toLowerCase() ?? "";
      return name.includes(query) || description.includes(query);
    },
    initialState: {
      columnOrder: prefs.columnOrder,
      columnSizing: prefs.columnSizing,
      columnVisibility: initialColumnVisibilityRef.current,
      sorting: prefs.sorting
    },
    state: {
      globalFilter,
      grouping: prefs.groupBy === "none" ? [] : ["groupKey"]
    }
  });

  const visibleDataRows = table.getRowModel().rows.filter((row) => !row.getIsGrouped());

  const handleRowActivate = useCallback(
    (row: Row<VariableCatalogTableRow>) => {
      onSelectRow(row.original);
    },
    [onSelectRow]
  );

  const handleTableKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (visibleDataRows.length === 0) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setFocusedRowIndex((current) => Math.min(current + 1, visibleDataRows.length - 1));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setFocusedRowIndex((current) => Math.max(current - 1, 0));
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const row = visibleDataRows[focusedRowIndex];
      if (row) {
        handleRowActivate(row);
      }
    }
  };

  const handleColumnDragStart = (columnId: string) => (event: DragEvent<HTMLTableCellElement>) => {
    setDraggingColumnId(columnId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", columnId);
  };

  const handleColumnDrop = (targetColumnId: string) => (event: DragEvent<HTMLTableCellElement>) => {
    event.preventDefault();
    const sourceColumnId = draggingColumnId ?? event.dataTransfer.getData("text/plain");
    setDraggingColumnId(null);
    if (!sourceColumnId || sourceColumnId === targetColumnId || sourceColumnId === "groupKey") {
      return;
    }

    const nextOrder = reorderColumnOrder(
      table.getState().columnOrder.length > 0 ? table.getState().columnOrder : prefs.columnOrder,
      sourceColumnId,
      targetColumnId
    );
    table.setColumnOrder(nextOrder);
    setColumnOrder(nextOrder);
  };

  const handleOptionalColumnToggle = (columnId: (typeof OPTIONAL_COLUMN_IDS)[number], visible: boolean) => {
    table.getColumn(columnId)?.toggleVisibility(visible);
    setColumnVisibility(extractOptionalVisibility(table.getState().columnVisibility));
  };

  const handleColumnResizeEnd = () => {
    setColumnSizing(table.getState().columnSizing);
  };

  const handleColumnSort = (columnId: string) => {
    const column = table.getColumn(columnId);
    if (!column) {
      return;
    }

    column.toggleSorting();
    setSorting(table.getState().sorting);
  };

  const groupByOptions = showModelColumn
    ? GROUP_BY_OPTIONS
    : GROUP_BY_OPTIONS.filter((option) => option.value !== "model");

  return (
    <section className="control-panel variable-catalog-panel notebook-sidebar-panel" role="tabpanel">
      <VariableCatalogToolbar
        columnsMenuOpen={columnsMenuOpen}
        globalFilter={globalFilter}
        groupBy={prefs.groupBy}
        groupByOptions={groupByOptions}
        onColumnsMenuOpenChange={setColumnsMenuOpen}
        onGlobalFilterChange={setGlobalFilter}
        onGroupByChange={setGroupBy}
        onOptionalColumnToggle={handleOptionalColumnToggle}
        table={table}
      />

      <VariableCatalogTableShell
        focusedRowIndex={focusedRowIndex}
        handleColumnDragStart={handleColumnDragStart}
        handleColumnDrop={handleColumnDrop}
        handleColumnResizeEnd={handleColumnResizeEnd}
        handleColumnSort={handleColumnSort}
        handleRowActivate={handleRowActivate}
        handleTableKeyDown={handleTableKeyDown}
        selectedVariable={selectedVariable}
        table={table}
        tableShellRef={tableShellRef}
      />
    </section>
  );
}

function VariableCatalogToolbar<T extends VariableCatalogTableRow>({
  columnsMenuOpen,
  globalFilter,
  groupBy,
  groupByOptions,
  onColumnsMenuOpenChange,
  onGlobalFilterChange,
  onGroupByChange,
  onOptionalColumnToggle,
  table
}: {
  columnsMenuOpen: boolean;
  globalFilter: string;
  groupBy: VariableCatalogGroupBy;
  groupByOptions: Array<{ value: VariableCatalogGroupBy; label: string }>;
  onColumnsMenuOpenChange(next: boolean): void;
  onGlobalFilterChange(next: string): void;
  onGroupByChange(next: VariableCatalogGroupBy): void;
  onOptionalColumnToggle(columnId: (typeof OPTIONAL_COLUMN_IDS)[number], visible: boolean): void;
  table: Table<T>;
}) {
  return (
    <div className="variable-catalog-toolbar">
      <span className="variable-catalog-toolbar-label">Search</span>
      <span className="variable-catalog-toolbar-label">Group by</span>
      <span className="variable-catalog-toolbar-label">Columns</span>

      <label className="variable-catalog-search field">
        <input
          type="search"
          value={globalFilter}
          placeholder="Filter by name or description"
          aria-label="Search"
          onChange={(event) => onGlobalFilterChange(event.target.value)}
        />
      </label>

      <label className="variable-catalog-group-by field">
        <select
          value={groupBy}
          aria-label="Group by"
          onChange={(event) => onGroupByChange(event.target.value as VariableCatalogGroupBy)}
        >
          {groupByOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <VariableCatalogColumnsMenu
        columnsMenuOpen={columnsMenuOpen}
        onColumnsMenuOpenChange={onColumnsMenuOpenChange}
        onOptionalColumnToggle={onOptionalColumnToggle}
        table={table}
      />
    </div>
  );
}

function VariableCatalogColumnsMenu<T extends VariableCatalogTableRow>({
  columnsMenuOpen,
  onColumnsMenuOpenChange,
  onOptionalColumnToggle,
  table
}: {
  columnsMenuOpen: boolean;
  onColumnsMenuOpenChange(next: boolean): void;
  onOptionalColumnToggle(columnId: (typeof OPTIONAL_COLUMN_IDS)[number], visible: boolean): void;
  table: Table<T>;
}) {
  return (
    <div className="variable-catalog-columns-menu">
      <button
        type="button"
        className="secondary-button"
        aria-expanded={columnsMenuOpen}
        onClick={() => onColumnsMenuOpenChange(!columnsMenuOpen)}
      >
        Columns
      </button>
      {columnsMenuOpen ? (
        <div className="variable-catalog-columns-popover">
          {OPTIONAL_COLUMN_IDS.map((columnId) => {
            const column = table.getColumn(columnId);
            if (!column || (columnId === "modelTitle" && !column.getCanHide())) {
              return null;
            }

            return (
              <label key={columnId} className="variable-catalog-column-toggle">
                <input
                  type="checkbox"
                  checked={column.getIsVisible()}
                  onChange={(event) => onOptionalColumnToggle(columnId, event.target.checked)}
                />
                <span>{OPTIONAL_COLUMN_LABELS[columnId]}</span>
              </label>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function VariableCatalogTableShell<T extends VariableCatalogTableRow>({
  focusedRowIndex,
  handleColumnDragStart,
  handleColumnDrop,
  handleColumnResizeEnd,
  handleColumnSort,
  handleRowActivate,
  handleTableKeyDown,
  selectedVariable,
  table,
  tableShellRef
}: {
  focusedRowIndex: number;
  handleColumnDragStart(columnId: string): (event: DragEvent<HTMLTableCellElement>) => void;
  handleColumnDrop(targetColumnId: string): (event: DragEvent<HTMLTableCellElement>) => void;
  handleColumnResizeEnd(): void;
  handleColumnSort(columnId: string): void;
  handleRowActivate(row: Row<T>): void;
  handleTableKeyDown(event: KeyboardEvent<HTMLDivElement>): void;
  selectedVariable: string | null;
  table: Table<T>;
  tableShellRef: RefObject<HTMLDivElement | null>;
}) {
  let dataRowIndex = -1;

  return (
    <CatalogTableScrollShell handleTableKeyDown={handleTableKeyDown} tableShellRef={tableShellRef}>
      <table className="variable-catalog-table">
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                if (header.column.id === "groupKey") {
                  return null;
                }

                const sorted = header.column.getIsSorted();
                return (
                  <th
                    key={header.id}
                    draggable={header.column.id !== "groupKey"}
                    style={{ width: header.getSize() }}
                    onDragOver={(event) => event.preventDefault()}
                    onDragStart={handleColumnDragStart(header.column.id)}
                    onDrop={handleColumnDrop(header.column.id)}
                  >
                    <button
                      type="button"
                      className="variable-catalog-header-button"
                      onClick={() => handleColumnSort(header.column.id)}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {sorted === "asc" ? " ↑" : sorted === "desc" ? " ↓" : ""}
                    </button>
                    {header.column.getCanResize() ? (
                      <span
                        className="equation-grid-column-resize variable-catalog-column-resize"
                        onMouseDown={header.getResizeHandler()}
                        onMouseUp={handleColumnResizeEnd}
                        onTouchStart={header.getResizeHandler()}
                        onTouchEnd={handleColumnResizeEnd}
                      />
                    ) : null}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.length === 0 ? (
            <tr>
              <td colSpan={table.getVisibleLeafColumns().length} className="variable-catalog-empty">
                No variables match the current filter.
              </td>
            </tr>
          ) : (
            table.getRowModel().rows.map((row) => {
              if (row.getIsGrouped()) {
                return (
                  <tr key={row.id} className="variable-catalog-group-row">
                    <td colSpan={table.getVisibleLeafColumns().length}>
                      <button
                        type="button"
                        className="variable-catalog-group-toggle"
                        onClick={row.getToggleExpandedHandler()}
                      >
                        <span aria-hidden="true">{row.getIsExpanded() ? "▾" : "▸"}</span>
                        <span>{String(row.getValue("groupKey"))}</span>
                        <span className="variable-catalog-group-count">{row.subRows.length}</span>
                      </button>
                    </td>
                  </tr>
                );
              }

              dataRowIndex += 1;
              const isSelected = selectedVariable === row.original.name;
              const isFocused = dataRowIndex === focusedRowIndex;

              return (
                <tr
                  key={row.id}
                  className={`variable-catalog-data-row${isSelected ? " is-selected" : ""}${
                    isFocused ? " is-focused" : ""
                  }`.trim()}
                  onClick={() => handleRowActivate(row)}
                >
                  {row.getVisibleCells().map((cell) => {
                    if (cell.column.id === "groupKey") {
                      return null;
                    }

                    return (
                      <td key={cell.id} style={{ width: cell.column.getSize() }}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    );
                  })}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </CatalogTableScrollShell>
  );
}

function CatalogTableScrollShell({
  children,
  handleTableKeyDown,
  tableShellRef
}: {
  children: ReactNode;
  handleTableKeyDown(event: KeyboardEvent<HTMLDivElement>): void;
  tableShellRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      ref={tableShellRef}
      className="variable-catalog-table-shell notebook-oversize-scroll"
      tabIndex={0}
      onKeyDown={handleTableKeyDown}
    >
      {children}
    </div>
  );
}
