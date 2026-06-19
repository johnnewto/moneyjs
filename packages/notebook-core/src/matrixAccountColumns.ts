export type MatrixAccountBadgeRole = "asset" | "liability" | "equity";

export interface MatrixColumnHeaderCell {
  nodeId: string;
  label: string;
  fullLabel?: string;
  variableSymbol?: string;
  colSpan: number;
  rowSpan: number;
  columnIndex?: number;
  isLeaf: boolean;
  isExpandable: boolean;
  isCollapsedStub?: boolean;
  isLeafHidden?: boolean;
  stockRole?: MatrixAccountBadgeRole;
  inspectVariable?: string;
  isSectorStart?: boolean;
}

export interface MatrixAccountColumnLeafDisplay {
  accountName: string;
  variableSymbol?: string;
  fullLabel: string;
}

export interface MatrixSectorDisplay {
  sectorName: string;
  variableSymbol?: string;
  fullLabel: string;
}

export type MatrixColumnDisplaySlot =
  | { kind: "leaf"; columnIndex: number }
  | { kind: "collapsed"; nodeId: string; label: string; fullLabel?: string }
  | {
      kind: "hiddenLeaf";
      nodeId: string;
      columnIndex: number;
      stockRole?: MatrixAccountBadgeRole;
    };

const MATRIX_ACCOUNT_HEADER_ROW_COUNT = 2;

export function isSumColumnLabel(column: string): boolean {
  return column.trim().toLowerCase() === "sum";
}

export function sectorCollapseKey(sectorLabel: string): string {
  return `sector:${sectorLabel.trim()}`;
}

export function columnCollapseKey(
  columnIndex: number,
  columns?: readonly string[],
  sectors?: readonly string[]
): string {
  if (columns) {
    const label = columns[columnIndex]?.trim() ?? "";
    const sector = sectors?.[columnIndex]?.trim() ?? "";
    if (sector && label) {
      return `col:${sector}:${label}`;
    }
    if (label) {
      return `col:${label}@${columnIndex}`;
    }
  }
  return `col:${columnIndex}`;
}

/** Maps legacy index-only collapse ids from localStorage to stable sector/label keys. */
export function migrateLegacyColumnCollapseNodeId(
  nodeId: string,
  columns: readonly string[],
  sectors?: readonly string[]
): string {
  const legacy = /^col:(\d+)$/.exec(nodeId);
  if (!legacy) {
    return nodeId;
  }
  const index = Number(legacy[1]);
  if (!Number.isInteger(index) || index < 0 || index >= columns.length) {
    return nodeId;
  }
  return columnCollapseKey(index, columns, sectors);
}

export function serializeMatrixColumnCollapseNodeIds(ids: Iterable<string>): string {
  return [...ids].sort().join("\u0001");
}

export function parseVariableFromColumnLabel(label: string): string | undefined {
  const match = label.trim().match(/\(([^)]+)\)\s*$/);
  return match?.[1]?.trim() || undefined;
}

export function stripMatrixColumnVariableSuffix(label: string): string {
  return label.trim().replace(/\s*\([^)]+\)\s*$/, "").trim();
}

/** Canonical sum(columnRef) key for account-transactions columns. */
export function resolveMatrixColumnSumReference(
  columns: string[],
  columnIndex: number,
  sectors?: string[]
): string {
  const label = columns[columnIndex]?.trim() ?? "";
  if (!label) {
    return "";
  }

  const baseRef = stripMatrixColumnVariableSuffix(label);
  if (!baseRef || baseRef.toLowerCase() === "sum") {
    return "";
  }
  if (baseRef.includes(".")) {
    return baseRef;
  }

  const sectorLabel = sectors?.[columnIndex]?.trim() ?? "";
  if (!sectorLabel) {
    return baseRef;
  }

  const sectorName = parseMatrixSectorDisplay(sectorLabel).sectorName.trim();
  if (!sectorName) {
    return baseRef;
  }

  return `${sectorName}.${baseRef}`;
}

export function resolveMatrixColumnInspectVariable(
  columns: string[],
  columnIndex: number,
  variables?: string[],
  sectors?: string[]
): string {
  const columnSumRef = resolveMatrixColumnSumReference(columns, columnIndex, sectors);
  if (columnSumRef) {
    return columnSumRef;
  }

  const fromVariables = variables?.[columnIndex]?.trim();
  if (fromVariables) {
    return fromVariables;
  }
  const label = columns[columnIndex]?.trim() ?? "";
  return parseVariableFromColumnLabel(label) ?? label;
}

export function normalizeMatrixAccountBadgeRole(input: unknown): MatrixAccountBadgeRole | undefined {
  if (typeof input !== "string") {
    return undefined;
  }
  const key = input.trim().toLowerCase().replace(/[\s_-]+/g, "");
  switch (key) {
    case "a":
    case "asset":
    case "assets":
      return "asset";
    case "l":
    case "liability":
    case "liabilities":
      return "liability";
    case "e":
    case "equity":
    case "networth":
      return "equity";
    default:
      return undefined;
  }
}

export function parseMatrixSectorDisplay(label: string): MatrixSectorDisplay {
  const fullLabel = label.trim();
  const variableSymbol = parseVariableFromColumnLabel(fullLabel);
  const sectorName = variableSymbol
    ? fullLabel.replace(/\s*\([^)]+\)\s*$/, "").trim()
    : fullLabel;
  return {
    sectorName,
    fullLabel,
    ...(variableSymbol ? { variableSymbol } : {})
  };
}

/** Header/body label for a collapsed sector group; prefers the parenthetical alias. */
export function formatMatrixSectorCollapsedLabel(label: string): string {
  const display = parseMatrixSectorDisplay(label);
  return display.variableSymbol ?? display.sectorName;
}

export function parseMatrixAccountColumnLeafDisplay(label: string): MatrixAccountColumnLeafDisplay {
  const fullLabel = label.trim();
  const variableSymbol = parseVariableFromColumnLabel(fullLabel);
  let withoutVariable = fullLabel;
  if (variableSymbol) {
    withoutVariable = fullLabel.replace(/\s*\([^)]+\)\s*$/, "").trim();
  }
  const dotIndex = withoutVariable.indexOf(".");
  const accountName = dotIndex >= 0 ? withoutVariable.slice(dotIndex + 1) : withoutVariable;
  return {
    accountName,
    ...(variableSymbol ? { variableSymbol } : {}),
    fullLabel
  };
}

function matrixSectorHeaderFields(
  sectorLabel: string,
  collapsed: boolean
): Pick<MatrixColumnHeaderCell, "label" | "fullLabel" | "variableSymbol"> {
  const display = parseMatrixSectorDisplay(sectorLabel);
  return {
    label: collapsed ? formatMatrixSectorCollapsedLabel(sectorLabel) : display.sectorName,
    fullLabel: display.fullLabel,
    ...(display.variableSymbol ? { variableSymbol: display.variableSymbol } : {})
  };
}

export function formatMatrixColumnLeafHeaderLabel(label: string): string {
  return parseMatrixAccountColumnLeafDisplay(label).accountName;
}

/** Visible account header: column text without trailing (variable) suffix. */
export function formatMatrixAccountColumnDisplayLabel(label: string): string {
  const fullLabel = label.trim();
  const variableSymbol = parseVariableFromColumnLabel(fullLabel);
  if (variableSymbol) {
    return fullLabel.replace(/\s*\([^)]+\)\s*$/, "").trim();
  }
  return fullLabel;
}

/** Tooltip title: sector prepended to the display label when sector is set. */
export function formatMatrixAccountColumnTooltipLabel(
  columnLabel: string,
  sectorLabel: string | undefined
): string {
  const displayLabel = formatMatrixAccountColumnDisplayLabel(columnLabel);
  const sector = sectorLabel?.trim() ?? "";
  if (!sector) {
    return displayLabel;
  }
  return `${sector}.${displayLabel}`;
}

export function formatMatrixAccountRowBalanceBreakdown(
  row: Array<number | null>,
  columnBadges: string[],
  sumColumnIndex: number,
  formatValue: (value: number) => string = String
): string {
  const terms: string[] = [];
  let total = 0;

  for (let columnIndex = 0; columnIndex < row.length; columnIndex += 1) {
    if (columnIndex === sumColumnIndex) {
      continue;
    }
    const value = row[columnIndex];
    if (value == null || !Number.isFinite(value) || value === 0) {
      continue;
    }
    const role = normalizeMatrixAccountBadgeRole(columnBadges[columnIndex]);
    const signed = signedMatrixAccountColumnContribution(value, role);
    if (signed === 0) {
      continue;
    }
    total += signed;
    const magnitude = formatValue(Math.abs(signed));
    terms.push(signed > 0 ? `+${magnitude}` : `−${magnitude}`);
  }

  const totalLabel = formatValue(total);
  if (terms.length === 0) {
    return `= ${totalLabel}`;
  }
  return `${terms.join(" ")} = ${totalLabel}`;
}

export function usesMatrixAccountColumnLayout(columnBadges: string[] | undefined): boolean {
  return Array.isArray(columnBadges) && columnBadges.length > 0;
}

export function usesMatrixSectorColumnLayout(
  columns: readonly string[],
  sectors: string[] | undefined,
  columnBadges: string[] | undefined,
  columnTree?: readonly unknown[] | undefined
): boolean {
  if (usesMatrixAccountColumnLayout(columnBadges)) {
    return false;
  }
  if (columnTree && columnTree.length > 0) {
    return false;
  }
  if (!sectors || sectors.length !== columns.length) {
    return false;
  }
  return sectors.some((sector) => sector.trim().length > 0);
}

export function isMatrixAccountSectorStartColumn(
  columns: string[],
  sectors: string[] | undefined,
  columnIndex: number
): boolean {
  const columnLabel = columns[columnIndex]?.trim() ?? "";
  if (isSumColumnLabel(columnLabel)) {
    return false;
  }

  const sectorLabel = sectors?.[columnIndex]?.trim() ?? "";
  if (!sectorLabel) {
    return false;
  }

  let index = columnIndex;
  while (index > 0) {
    const previousLabel = columns[index - 1]?.trim() ?? "";
    if (isSumColumnLabel(previousLabel)) {
      break;
    }
    if ((sectors?.[index - 1]?.trim() ?? "") !== sectorLabel) {
      break;
    }
    index -= 1;
  }

  return index === columnIndex;
}

/** True when a faint divider should appear to the right (another account column follows in the same sector). */
export function isMatrixAccountIntraSectorColumnDivider(
  columns: string[],
  sectors: string[] | undefined,
  columnIndex: number
): boolean {
  const columnLabel = columns[columnIndex]?.trim() ?? "";
  if (isSumColumnLabel(columnLabel)) {
    return false;
  }

  const sectorLabel = sectors?.[columnIndex]?.trim() ?? "";
  if (!sectorLabel) {
    return false;
  }

  const nextIndex = columnIndex + 1;
  if (nextIndex >= columns.length) {
    return false;
  }

  const nextLabel = columns[nextIndex]?.trim() ?? "";
  if (isSumColumnLabel(nextLabel)) {
    return false;
  }

  return (sectors?.[nextIndex]?.trim() ?? "") === sectorLabel;
}

export function resolveMatrixAccountColumnCellClasses(
  columns: string[],
  sectors: string[] | undefined,
  columnBadges: string[] | undefined,
  columnIndex: number,
  sumColumnIndex: number,
  columnTree?: readonly unknown[] | undefined
): string[] {
  const showSectorBoundaries =
    usesMatrixAccountColumnLayout(columnBadges) ||
    usesMatrixSectorColumnLayout(columns, sectors, columnBadges, columnTree);
  if (!showSectorBoundaries) {
    return [];
  }

  const classes: string[] = [];
  if (isMatrixAccountSectorStartColumn(columns, sectors, columnIndex)) {
    classes.push("notebook-matrix-sector-start");
  }
  if (isMatrixAccountIntraSectorColumnDivider(columns, sectors, columnIndex)) {
    classes.push("notebook-matrix-intra-sector-divider");
  }
  if (columnIndex === sumColumnIndex) {
    return classes;
  }

  if (!usesMatrixAccountColumnLayout(columnBadges)) {
    return classes;
  }

  const role = normalizeMatrixAccountBadgeRole(columnBadges?.[columnIndex]);
  if (role) {
    classes.push(`notebook-matrix-cell-${role}`);
  }
  return classes;
}

export function sectorsAlignWithMatrixColumns(
  columns: readonly string[],
  sectors: string[] | undefined
): boolean {
  return Boolean(sectors && sectors.length === columns.length);
}

export function isMatrixEquityColumn(
  columnBadges: string[] | undefined,
  columnIndex: number
): boolean {
  return normalizeMatrixAccountBadgeRole(columnBadges?.[columnIndex]) === "equity";
}

export function sectorHasSingleEquityColumn(
  columns: readonly string[],
  sectors: string[] | undefined,
  columnBadges: string[] | undefined,
  sectorLabel: string,
  sumColumnIndex: number
): boolean {
  let equityCount = 0;
  for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
    if (columnIndex === sumColumnIndex) {
      continue;
    }
    if ((sectors?.[columnIndex]?.trim() ?? "") !== sectorLabel) {
      continue;
    }
    if (isMatrixEquityColumn(columnBadges, columnIndex)) {
      equityCount += 1;
    }
  }
  return equityCount === 1;
}

/** Implied equity for an empty column from sector row assets and/or liabilities. */
export function computeSectorImpliedEquity(
  columns: readonly string[],
  sectors: string[] | undefined,
  columnBadges: string[] | undefined,
  equityColumnIndex: number,
  getColumnValue: (columnIndex: number) => number | null,
  sumColumnIndex = columns.findIndex((column) => isSumColumnLabel(column))
): number | null {
  if (!sectorsAlignWithMatrixColumns(columns, sectors)) {
    return null;
  }
  if (!isMatrixEquityColumn(columnBadges, equityColumnIndex)) {
    return null;
  }

  const sectorLabel = sectors?.[equityColumnIndex]?.trim() ?? "";
  if (!sectorLabel) {
    return null;
  }
  if (
    !sectorHasSingleEquityColumn(columns, sectors, columnBadges, sectorLabel, sumColumnIndex)
  ) {
    return null;
  }

  let assets = 0;
  let liabilities = 0;
  let hasSectorAsset = false;
  let hasSectorLiability = false;

  for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
    if (columnIndex === sumColumnIndex || columnIndex === equityColumnIndex) {
      continue;
    }
    if ((sectors?.[columnIndex]?.trim() ?? "") !== sectorLabel) {
      continue;
    }

    const role = normalizeMatrixAccountBadgeRole(columnBadges?.[columnIndex]);
    if (role !== "asset" && role !== "liability") {
      continue;
    }

    const value = getColumnValue(columnIndex);
    if (value == null) {
      continue;
    }
    if (!Number.isFinite(value)) {
      return null;
    }

    if (role === "asset") {
      assets += value;
      hasSectorAsset = true;
    } else {
      liabilities += value;
      hasSectorLiability = true;
    }
  }

  if (!hasSectorAsset && !hasSectorLiability) {
    return null;
  }
  if (hasSectorAsset && hasSectorLiability) {
    return assets - liabilities;
  }
  if (hasSectorAsset) {
    return assets;
  }

  return -liabilities;
}

/** Row total for account-transaction matrices: asset +, liability and equity −. */
export function signedMatrixAccountColumnContribution(
  value: number | null,
  role: MatrixAccountBadgeRole | undefined
): number {
  if (value == null || !role) {
    return 0;
  }
  return role === "asset" ? value : -value;
}

export function computeMatrixAccountRowTotal(
  row: Array<number | null>,
  columnBadges: string[],
  sumColumnIndex: number
): number {
  return row.reduce<number>((total, value, columnIndex) => {
    if (columnIndex === sumColumnIndex) {
      return total;
    }
    const role = normalizeMatrixAccountBadgeRole(columnBadges[columnIndex]);
    return total + signedMatrixAccountColumnContribution(value, role);
  }, 0);
}

export function validateMatrixAccountColumnsLayout(
  columns: string[],
  sectors: string[] | undefined,
  columnBadges: string[] | undefined,
  variables?: string[]
): string | null {
  if (!columnBadges || columnBadges.length === 0) {
    return null;
  }

  if (columns.length !== columnBadges.length) {
    return `columnBadges has ${columnBadges.length} entries but columns has ${columns.length}.`;
  }

  if (sectors && sectors.length !== columns.length) {
    return `sectors has ${sectors.length} entries but columns has ${columns.length}.`;
  }

  if (variables && variables.length !== columns.length) {
    return `variables has ${variables.length} entries but columns has ${columns.length}.`;
  }

  for (let index = 0; index < columnBadges.length; index += 1) {
    if (isSumColumnLabel(columns[index] ?? "")) {
      continue;
    }
    if (!normalizeMatrixAccountBadgeRole(columnBadges[index])) {
      return `columnBadges[${index}] '${columnBadges[index]}' must be asset, liability, or equity.`;
    }
  }

  return null;
}

export function buildMatrixAccountColumnDisplaySlots(
  columns: string[],
  sectors: string[] | undefined,
  columnBadges: string[],
  collapsedNodeIds: ReadonlySet<string>,
  options?: { perColumnCollapse?: boolean }
): MatrixColumnDisplaySlot[] {
  const perColumnCollapse = options?.perColumnCollapse ?? true;
  const slots: MatrixColumnDisplaySlot[] = [];
  let index = 0;

  while (index < columns.length) {
    const columnLabel = columns[index]?.trim() ?? "";
    if (isSumColumnLabel(columnLabel)) {
      index += 1;
      continue;
    }

    const sectorLabel = sectors?.[index]?.trim() ?? "";
    let groupEnd = index + 1;
    if (sectorLabel) {
      while (groupEnd < columns.length) {
        const nextLabel = columns[groupEnd]?.trim() ?? "";
        if (isSumColumnLabel(nextLabel)) {
          break;
        }
        if ((sectors?.[groupEnd]?.trim() ?? "") !== sectorLabel) {
          break;
        }
        groupEnd += 1;
      }

      if (collapsedNodeIds.has(sectorCollapseKey(sectorLabel))) {
        const sectorDisplay = parseMatrixSectorDisplay(sectorLabel);
        slots.push({
          kind: "collapsed",
          nodeId: sectorCollapseKey(sectorLabel),
          label: formatMatrixSectorCollapsedLabel(sectorLabel),
          fullLabel: sectorDisplay.fullLabel
        });
        index = groupEnd;
        continue;
      }
    }

    if (perColumnCollapse) {
      const badgeRole = normalizeMatrixAccountBadgeRole(columnBadges[index]);
      const collapseKey = columnCollapseKey(index, columns, sectors);
      if (collapsedNodeIds.has(collapseKey)) {
        slots.push({
          kind: "hiddenLeaf",
          nodeId: collapseKey,
          columnIndex: index,
          ...(badgeRole ? { stockRole: badgeRole } : {})
        });
        index += 1;
        continue;
      }
    }
    slots.push({ kind: "leaf", columnIndex: index });
    index += 1;
  }

  return slots;
}

export function buildMatrixAccountColumnHeaderRows(
  columns: string[],
  sectors: string[] | undefined,
  columnBadges: string[],
  variables: string[] | undefined,
  collapsedNodeIds: ReadonlySet<string>,
  options?: { perColumnCollapse?: boolean }
): MatrixColumnHeaderCell[][] {
  const perColumnCollapse = options?.perColumnCollapse ?? true;
  const rows: MatrixColumnHeaderCell[][] = Array.from(
    { length: MATRIX_ACCOUNT_HEADER_ROW_COUNT },
    () => []
  );

  let index = 0;
  while (index < columns.length) {
    const columnLabel = columns[index]?.trim() ?? "";
    if (isSumColumnLabel(columnLabel)) {
      index += 1;
      continue;
    }

    const sectorLabel = sectors?.[index]?.trim() ?? "";
    let groupEnd = index + 1;
    if (sectorLabel) {
      while (groupEnd < columns.length) {
        const nextLabel = columns[groupEnd]?.trim() ?? "";
        if (isSumColumnLabel(nextLabel)) {
          break;
        }
        if ((sectors?.[groupEnd]?.trim() ?? "") !== sectorLabel) {
          break;
        }
        groupEnd += 1;
      }

      if (collapsedNodeIds.has(sectorCollapseKey(sectorLabel))) {
        rows[0]?.push({
          nodeId: sectorCollapseKey(sectorLabel),
          ...matrixSectorHeaderFields(sectorLabel, true),
          colSpan: 1,
          rowSpan: MATRIX_ACCOUNT_HEADER_ROW_COUNT,
          isLeaf: false,
          isExpandable: true,
          isCollapsedStub: true,
          isSectorStart: true
        });
        index = groupEnd;
        continue;
      }

      rows[0]?.push({
        nodeId: sectorCollapseKey(sectorLabel),
        ...matrixSectorHeaderFields(sectorLabel, false),
        colSpan: groupEnd - index,
        rowSpan: 1,
        isLeaf: false,
        isExpandable: true,
        isSectorStart: true
      });
    }

    for (let columnIndex = index; columnIndex < groupEnd; columnIndex += 1) {
      const label = columns[columnIndex]?.trim() ?? "";
      const leafDisplay = parseMatrixAccountColumnLeafDisplay(label);
      const badgeRole = normalizeMatrixAccountBadgeRole(columnBadges[columnIndex]);
      const collapseKey = columnCollapseKey(columnIndex, columns, sectors);
      const isHidden = perColumnCollapse && collapsedNodeIds.has(collapseKey);
      rows[1]?.push({
        nodeId: collapseKey,
        label: formatMatrixAccountColumnDisplayLabel(label),
        fullLabel: formatMatrixAccountColumnTooltipLabel(label, sectors?.[columnIndex]),
        ...(leafDisplay.variableSymbol ? { variableSymbol: leafDisplay.variableSymbol } : {}),
        colSpan: 1,
        rowSpan: 1,
        columnIndex,
        isLeaf: true,
        isExpandable: false,
        isLeafHidden: isHidden,
        isSectorStart: columnIndex === index,
        inspectVariable: resolveMatrixColumnInspectVariable(columns, columnIndex, variables, sectors),
        ...(badgeRole ? { stockRole: badgeRole } : {})
      });
    }

    index = groupEnd;
  }

  return rows;
}

export function collectMatrixAccountSectorCollapseKeys(sectors: string[] | undefined): string[] {
  const keys = new Set<string>();
  for (const sector of sectors ?? []) {
    const label = sector.trim();
    if (label) {
      keys.add(sectorCollapseKey(label));
    }
  }
  return [...keys];
}

export function parseMatrixColumnBadges(input: unknown): string[] | undefined {
  if (!Array.isArray(input)) {
    return undefined;
  }
  const badges = input.map((entry) => String(entry));
  return badges.length > 0 ? badges : undefined;
}
