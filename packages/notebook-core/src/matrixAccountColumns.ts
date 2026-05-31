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

export type MatrixColumnDisplaySlot =
  | { kind: "leaf"; columnIndex: number }
  | { kind: "collapsed"; nodeId: string; label: string }
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

export function columnCollapseKey(columnIndex: number): string {
  return `col:${columnIndex}`;
}

export function parseVariableFromColumnLabel(label: string): string | undefined {
  const match = label.trim().match(/\(([^)]+)\)\s*$/);
  return match?.[1]?.trim() || undefined;
}

export function resolveMatrixColumnInspectVariable(
  columns: string[],
  columnIndex: number,
  variables?: string[]
): string {
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

export function formatMatrixColumnLeafHeaderLabel(label: string): string {
  return parseMatrixAccountColumnLeafDisplay(label).accountName;
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
  sumColumnIndex: number
): string[] {
  if (!usesMatrixAccountColumnLayout(columnBadges)) {
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

  const role = normalizeMatrixAccountBadgeRole(columnBadges[columnIndex]);
  if (role) {
    classes.push(`notebook-matrix-cell-${role}`);
  }
  return classes;
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
  collapsedNodeIds: ReadonlySet<string>
): MatrixColumnDisplaySlot[] {
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
        slots.push({ kind: "collapsed", nodeId: sectorCollapseKey(sectorLabel), label: sectorLabel });
        index = groupEnd;
        continue;
      }
    }

    const badgeRole = normalizeMatrixAccountBadgeRole(columnBadges[index]);
    const collapseKey = columnCollapseKey(index);
    if (collapsedNodeIds.has(collapseKey)) {
      slots.push({
        kind: "hiddenLeaf",
        nodeId: collapseKey,
        columnIndex: index,
        ...(badgeRole ? { stockRole: badgeRole } : {})
      });
    } else {
      slots.push({ kind: "leaf", columnIndex: index });
    }
    index += 1;
  }

  return slots;
}

export function buildMatrixAccountColumnHeaderRows(
  columns: string[],
  sectors: string[] | undefined,
  columnBadges: string[],
  variables: string[] | undefined,
  collapsedNodeIds: ReadonlySet<string>
): MatrixColumnHeaderCell[][] {
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
          label: sectorLabel,
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
        label: sectorLabel,
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
      const collapseKey = columnCollapseKey(columnIndex);
      const isHidden = collapsedNodeIds.has(collapseKey);
      rows[1]?.push({
        nodeId: collapseKey,
        label: leafDisplay.accountName,
        fullLabel: leafDisplay.fullLabel,
        ...(leafDisplay.variableSymbol ? { variableSymbol: leafDisplay.variableSymbol } : {}),
        colSpan: 1,
        rowSpan: 1,
        columnIndex,
        isLeaf: true,
        isExpandable: false,
        isLeafHidden: isHidden,
        isSectorStart: columnIndex === index,
        inspectVariable: resolveMatrixColumnInspectVariable(columns, columnIndex, variables),
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
