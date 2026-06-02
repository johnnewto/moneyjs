import { normalizeAccountingMatrixKindInput, normalizeMatrixCellAccountingKind } from "../accountingMatrixKind";
import { parseMatrixColumnBadges } from "../matrixAccountColumns";
import { parseMatrixColumnTree } from "../matrixColumnTree";
import {
  assertCompactRowPresent,
  buildCompactRowComment,
  isRowComment,
  parseCompactRowComment
} from "../rowComments";
import type {
  EquationListItem,
  EquationRow,
  ExternalListItem,
  ExternalRow,
  InitialValueListItem,
  InitialValueRow,
  NotebookCell,
  NotebookDocument
} from "../types";
import { NOTEBOOK_CELL_TYPES } from "./documentTypes";
import { isRecord, numberValue, slugifyIdentifier, stringArray, stringValue } from "./documentUtils";

export function generatedCompactModelId(document: NotebookDocument): string {
  return document.metadata.template ?? slugifyIdentifier(document.id.replace(/-?notebook$/i, "")) ?? "main";
}

export function buildCompactCellDescriptor(
  cell: NotebookCell,
  options: { fallbackId: string; fallbackTitle: string; preserveIds: boolean }
): Record<string, unknown> | undefined {
  const descriptor = {
    ...(options.preserveIds ? { id: cell.id } : {}),
    ...(cell.title !== options.fallbackTitle ? { title: cell.title } : {}),
    ...compactCellFlags(cell)
  };
  return Object.keys(descriptor).length > 0 ? descriptor : undefined;
}

export function buildCompactVariables(
  equationsCell: Extract<NotebookCell, { type: "equations" }>,
  parametersCell: Extract<NotebookCell, { type: "externals" }> | undefined
): Record<string, Record<string, unknown>> {
  const variables: Record<string, Record<string, unknown>> = {};
  equationsCell.equations.forEach((equation) => {
    if (isRowComment(equation)) {
      return;
    }
    variables[equation.name] = {
      ...(equation.desc ? { description: equation.desc } : {}),
      ...compactUnitFields(equation.unitMeta),
      ...(equation.role ? { role: equation.role } : {})
    };
  });
  parametersCell?.externals.forEach((external) => {
    if (isRowComment(external)) {
      return;
    }
    variables[external.name] = {
      ...(external.desc ? { description: external.desc } : {}),
      ...compactUnitFields(external.unitMeta)
    };
  });
  return variables;
}

export function buildCompactEquationVariables(
  equationsCell: Extract<NotebookCell, { type: "equations" }>
): Record<string, Record<string, unknown>> {
  const variables: Record<string, Record<string, unknown>> = {};
  equationsCell.equations.forEach((equation) => {
    if (isRowComment(equation)) {
      return;
    }
    variables[equation.name] = {
      ...(equation.desc ? { description: equation.desc } : {}),
      ...compactUnitFields(equation.unitMeta),
      ...(equation.role ? { role: equation.role } : {})
    };
  });
  return variables;
}

export function buildCompactEquationListRow(item: EquationListItem, index: number): unknown {
  if (isRowComment(item)) {
    return buildCompactRowComment(item);
  }
  return buildCompactEquationRow(item, index);
}

export function buildCompactEquationRow(equation: EquationRow, index: number): unknown[] {
  const unit = formatCompactUnit(equation.unitMeta);
  const type = equation.unitMeta?.stockFlow;
  const row = [equation.name, equation.expression, equation.desc, unit, type, equation.role];
  while (row.length > 2 && row[row.length - 1] == null) {
    row.pop();
  }
  const normalized = row.map((value) => value ?? "");
  const fallbackId = `eq-${index}-${slugifyIdentifier(equation.name)}`;
  if (equation.id === fallbackId) {
    return normalized;
  }
  while (normalized.length < 6) {
    normalized.push("");
  }
  return [...normalized, equation.id];
}

export function buildCompactExternalListRow(item: ExternalListItem, index: number): unknown {
  if (isRowComment(item)) {
    return buildCompactRowComment(item);
  }
  return buildCompactExternalRow(item, index);
}

export function buildCompactExternalRow(external: ExternalRow, index: number): unknown[] | Record<string, unknown> {
  if (external.kind !== "constant") {
    return {
      id: external.id,
      name: external.name,
      ...(external.desc ? { desc: external.desc } : {}),
      kind: external.kind,
      valueText: external.valueText,
      ...compactUnitFields(external.unitMeta)
    };
  }

  const unit = formatCompactUnit(external.unitMeta);
  const type = external.unitMeta?.stockFlow;
  const row = [external.name, scalarFromValueText(external.valueText), external.desc, unit, type];
  while (row.length > 2 && row[row.length - 1] == null) {
    row.pop();
  }
  const normalized = row.map((value) => value ?? "");
  const fallbackId = `ext-${index}-${slugifyIdentifier(external.name)}`;
  if (external.id === fallbackId) {
    return normalized;
  }
  while (normalized.length < 5) {
    normalized.push("");
  }
  return [...normalized, external.id];
}

export function buildCompactInitialValueListRow(item: InitialValueListItem, index: number): unknown {
  if (isRowComment(item)) {
    return buildCompactRowComment(item);
  }
  return buildCompactInitialValueRow(item, index);
}

export function buildCompactInitialValueRow(initialValue: InitialValueRow, index: number): unknown[] {
  const row = [initialValue.name, scalarFromValueText(initialValue.valueText)];
  const fallbackId = `init-${index}-${slugifyIdentifier(initialValue.name)}`;
  return initialValue.id === fallbackId ? row : [...row, initialValue.id];
}

export function buildCompactExternalVariables(
  parametersCell: Extract<NotebookCell, { type: "externals" }>
): Record<string, Record<string, unknown>> | undefined {
  const variables = Object.fromEntries(
    parametersCell.externals.flatMap((external) => {
      if (isRowComment(external)) {
        return [];
      }
      const meta = {
        ...(external.desc ? { description: external.desc } : {}),
        ...compactUnitFields(external.unitMeta)
      };
      return Object.keys(meta).length > 0 ? [[external.name, meta]] : [];
    })
  ) as Record<string, Record<string, unknown>>;
  return Object.keys(variables).length > 0 ? variables : undefined;
}

export function compactUnitFields(unitMeta: EquationRow["unitMeta"]): Record<string, unknown> {
  if (!unitMeta) {
    return {};
  }
  const unit = formatCompactUnit(unitMeta);
  return {
    ...(unit ? { unit } : { unitMeta }),
    ...(unitMeta.stockFlow ? { type: unitMeta.stockFlow } : {})
  };
}

export function buildCompactUnits(variables: Record<string, Record<string, unknown>> | undefined): Record<string, string> | undefined {
  if (!variables) {
    return undefined;
  }

  let hasCurrency = false;
  let hasTime = false;
  let hasLabor = false;

  Object.values(variables).forEach((meta) => {
    const unit = typeof meta.unit === "string" ? meta.unit : "";
    hasCurrency ||= unit.includes("$");
    hasTime ||= /(?:^|\/)y(?:ea)?r$|1\/y(?:ea)?r/.test(unit);
    hasLabor ||= /items?/.test(unit);

    const unitMeta = isRecord(meta.unitMeta) ? meta.unitMeta : undefined;
    const signature = unitMeta ? compactUnitSignature(unitMeta) : undefined;
    hasCurrency ||= typeof signature?.money === "number";
    hasTime ||= typeof signature?.time === "number";
    hasLabor ||= typeof signature?.items === "number";
  });

  const units: Record<string, string> = {};
  if (hasCurrency) units.currency = "$";
  if (hasTime) units.time = "year";
  if (hasLabor) units.labor = "items";
  return Object.keys(units).length > 0 ? units : undefined;
}

export function buildCompactSolverDescriptor(options: Extract<NotebookCell, { type: "solver" }>["options"]): Record<string, unknown> {
  return {
    ...(options.periods == null ? {} : { periods: options.periods }),
    method: options.solverMethod.toLowerCase().replace(/_/g, "-"),
    tolerance: options.toleranceText,
    maxIterations: options.maxIterations,
    defaultInitialValue: options.defaultInitialValueText,
    hiddenLeftVariable: options.hiddenLeftVariable,
    hiddenRightVariable: options.hiddenRightVariable,
    hiddenTolerance: options.hiddenToleranceText,
    relativeHiddenTolerance: options.relativeHiddenTolerance
  };
}

export function buildCompactMatrixDescriptor(
  cell: Extract<NotebookCell, { type: "matrix" }>,
  options: { fallbackId: string; preserveIds: boolean }
): Record<string, unknown> {
  return {
    ...(options.preserveIds ? { id: cell.id } : {}),
    title: cell.title,
    ...(cell.description ? { description: cell.description } : {}),
    ...(cell.note ? { note: cell.note } : {}),
    columns: cell.columns,
    ...(cell.sectors ? { sectors: cell.sectors } : {}),
    ...(cell.columnBadges ? { columnBadges: cell.columnBadges } : {}),
    ...(cell.variables ? { variables: cell.variables } : {}),
    ...(cell.columnTree ? { columnTree: cell.columnTree } : {}),
    ...(cell.accountingKind ? { accountingKind: cell.accountingKind } : {}),
    rows: cell.rows.map((row) => (row.band == null ? { label: row.label, values: row.values } : [row.band, row.label, ...row.values]))
  };
}

export function buildCompactChartDescriptor(
  cell: Extract<NotebookCell, { type: "chart" }>,
  options: { fallbackId: string; preserveIds: boolean }
): Record<string, unknown> {
  return {
    ...(options.preserveIds ? { id: cell.id } : {}),
    title: cell.title,
    ...(cell.description ? { description: cell.description } : {}),
    ...(cell.note ? { note: cell.note } : {}),
    variables: cell.variables,
    ...(cell.axisMode ? { axisMode: cell.axisMode } : {}),
    ...(cell.axisSnapTolarance == null ? {} : { axisSnapTolarance: cell.axisSnapTolarance }),
    ...(cell.niceScale == null ? {} : { niceScale: cell.niceScale }),
    ...(cell.referenceTrace ? { referenceTrace: cell.referenceTrace } : {}),
    ...(cell.yAxisTickCount == null ? {} : { yAxisTickCount: cell.yAxisTickCount }),
    ...(cell.sharedRange ? { sharedRange: cell.sharedRange } : {}),
    ...(cell.seriesRanges ? { seriesRanges: cell.seriesRanges } : {}),
    ...(cell.timeRangeInclusive ? { timeRangeInclusive: cell.timeRangeInclusive } : {})
  };
}

export function buildCompactTableDescriptor(
  cell: Extract<NotebookCell, { type: "table" }>,
  options: { fallbackId: string; preserveIds: boolean }
): Record<string, unknown> {
  return {
    ...(options.preserveIds ? { id: cell.id } : {}),
    title: cell.title,
    ...(cell.note ? { note: cell.note } : {}),
    ...(cell.description ? { description: cell.description } : {}),
    variables: cell.variables
  };
}

export function rewriteCompactReferences(value: unknown, idMap: Map<string, string>, modelIdMap: Map<string, string>, key?: string): unknown {
  if (typeof value === "string") {
    if (key === "type") {
      return value;
    }
    if ((key === "modelId" || key === "sourceModelId") && modelIdMap.has(value)) {
      return modelIdMap.get(value);
    }
    return idMap.get(value) ?? value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => rewriteCompactReferences(entry, idMap, modelIdMap));
  }
  if (!isRecord(value)) {
    return value;
  }
  return Object.fromEntries(Object.entries(value).map(([entryKey, entry]) => [entryKey, rewriteCompactReferences(entry, idMap, modelIdMap, entryKey)]));
}

export function scalarFromValueText(valueText: string): string | number | boolean {
  if (valueText === "true") {
    return true;
  }
  if (valueText === "false") {
    return false;
  }
  const number = Number(valueText);
  return Number.isFinite(number) && String(number) === valueText.trim() ? number : valueText;
}

export function formatCompactUnit(unitMeta: EquationRow["unitMeta"]): string | undefined {
  const signature = compactUnitSignature(unitMeta);
  if (!signature) {
    return undefined;
  }
  const money = signature.money;
  const time = signature.time;
  const items = signature.items;
  if (Object.keys(signature).length === 0) return "1";
  if (money === 1 && time === -1 && items == null) return "$/year";
  if (money === 1 && time == null && items == null) return "$";
  if (time === -1 && money == null && items == null) return "1/year";
  if (items === 1 && time === -1 && money == null) return "items/year";
  if (money === 1 && items === -1 && time == null) return "$/item";
  if (time === 1 && money == null && items == null) return "year";
  return undefined;
}

export function compactUnitSignature(unitMeta: unknown): Record<string, number> | undefined {
  if (!isRecord(unitMeta)) {
    return undefined;
  }
  if (isRecord(unitMeta.signature)) {
    return Object.fromEntries(Object.entries(unitMeta.signature).filter(([, value]) => typeof value === "number")) as Record<string, number>;
  }
  const units = isRecord(unitMeta.units) ? unitMeta.units : undefined;
  if (!units) {
    return undefined;
  }
  return {
    ...(typeof units.$ === "number" ? { money: units.$ } : {}),
    ...(typeof units.money === "number" ? { money: units.money } : {}),
    ...(typeof units.yr === "number" ? { time: units.yr } : {}),
    ...(typeof units.time === "number" ? { time: units.time } : {}),
    ...(typeof units.items === "number" ? { items: units.items } : {})
  };
}

export function isNotebookCellType(value: string): value is NotebookCell["type"] {
  return NOTEBOOK_CELL_TYPES.has(value as NotebookCell["type"]);
}

export function compactCellId(input: unknown, fallback: string): string {
  return isRecord(input) && typeof input.id === "string" ? input.id : fallback;
}

export function compactCellTitle(input: unknown, fallback: string): string {
  return isRecord(input) && typeof input.title === "string" ? input.title : fallback;
}

export function compactCellFlags(input: unknown): Pick<NotebookCell, "collapsed" | "description" | "note"> {
  if (!isRecord(input)) {
    return {};
  }
  return {
    ...(typeof input.collapsed === "boolean" ? { collapsed: input.collapsed } : {}),
    ...(typeof input.description === "string" ? { description: input.description } : {}),
    ...(typeof input.note === "string" ? { note: input.note } : {})
  };
}

export function orderCompactCells(cells: NotebookCell[], cellOrder: unknown): NotebookCell[] {
  if (!Array.isArray(cellOrder)) {
    return cells;
  }
  const cellsById = new Map(cells.map((cell) => [cell.id, cell]));
  const orderedIds = new Set<string>();
  const orderedCells = cellOrder.flatMap((entry) => {
    const id = String(entry);
    const cell = cellsById.get(id);
    if (!cell) {
      return [];
    }
    orderedIds.add(id);
    return [cell];
  });
  return [...orderedCells, ...cells.filter((cell) => !orderedIds.has(cell.id))];
}

export function parseCompactEquations(source: string, variables: unknown): Extract<NotebookCell, { type: "equations" }>["equations"] {
  const variableMeta = isRecord(variables) ? variables : {};
  return source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line, index) => {
      const match = line.match(/^([A-Za-z_][\w^{}.]*)\s*(?:~|=)\s*(.+)$/);
      if (!match) {
        throw new Error(`Invalid compact equation line: ${line}`);
      }

      const name = match[1];
      const meta = isRecord(variableMeta[name]) ? variableMeta[name] : {};
      return {
        id: `eq-${index}-${slugifyIdentifier(name)}`,
        name,
        ...(typeof meta.description === "string" ? { desc: meta.description } : {}),
        expression: match[2].trim(),
        ...(resolveEquationRole(meta) ? { role: resolveEquationRole(meta) } : {}),
        ...(buildUnitMeta(meta) ? { unitMeta: buildUnitMeta(meta) } : {})
      };
    });
}

export function parseCompactEquationRows(rows: unknown[], variables: unknown): EquationListItem[] {
  const variableMeta = isRecord(variables) ? variables : {};
  return rows.map((row, index) => {
    assertCompactRowPresent(row, index, "Equation");
    const comment = parseCompactRowComment(row, index, "eq-comment");
    if (comment) {
      return comment;
    }

    if (Array.isArray(row)) {
      const [rawName, rawExpression, rawDescription, rawUnit, rawType, rawRole, rawId] = row;
      const name = stringValue(rawName, "");
      const meta = {
        ...(isRecord(variableMeta[name]) ? variableMeta[name] : {}),
        ...(rawDescription == null || rawDescription === "" ? {} : { description: String(rawDescription) }),
        ...(rawUnit == null || rawUnit === "" ? {} : { unit: String(rawUnit) }),
        ...(rawType == null || rawType === "" ? {} : { type: String(rawType) }),
        ...(rawRole == null || rawRole === "" ? {} : { role: String(rawRole) })
      };
      return {
        id: stringValue(rawId, `eq-${index}-${slugifyIdentifier(name)}`),
        name,
        ...(typeof meta.description === "string" ? { desc: meta.description } : {}),
        expression: stringValue(rawExpression, "").trim(),
        ...(resolveEquationRole(meta) ? { role: resolveEquationRole(meta) } : {}),
        ...(buildUnitMeta(meta) ? { unitMeta: buildUnitMeta(meta) } : {})
      };
    }

    if (isRecord(row)) {
      const name = stringValue(row.name, "");
      const meta = {
        ...(isRecord(variableMeta[name]) ? variableMeta[name] : {}),
        ...(typeof row.desc === "string" ? { description: row.desc } : {}),
        ...(typeof row.description === "string" ? { description: row.description } : {}),
        ...(row.unit == null ? {} : { unit: String(row.unit) }),
        ...(row.type == null ? {} : { type: String(row.type) }),
        ...(row.role == null ? {} : { role: String(row.role) })
      };
      return {
        id: stringValue(row.id, `eq-${index}-${slugifyIdentifier(name)}`),
        name,
        ...(typeof meta.description === "string" ? { desc: meta.description } : {}),
        expression: stringValue(row.expr ?? row.expression, "").trim(),
        ...(resolveEquationRole(meta) ? { role: resolveEquationRole(meta) } : {}),
        ...(buildUnitMeta(meta) ? { unitMeta: buildUnitMeta(meta) } : {})
      };
    }

    throw new Error("Compact equation rows must be arrays or row objects.");
  });
}

export function buildCompactParameters(parameters: unknown, variables: unknown): Extract<NotebookCell, { type: "externals" }>["externals"] {
  if (!isRecord(parameters)) {
    return [];
  }

  const variableMeta = isRecord(variables) ? variables : {};
  return Object.entries(parameters).map(([name, value], index) => {
    const meta = isRecord(variableMeta[name]) ? variableMeta[name] : {};
    return {
      id: `ext-${index}-${slugifyIdentifier(name)}`,
      name,
      ...(typeof meta.description === "string" ? { desc: meta.description } : {}),
      kind: "constant",
      valueText: String(value),
      ...(buildUnitMeta(meta) ? { unitMeta: buildUnitMeta(meta) } : {})
    };
  });
}

export function parseCompactExternalRows(rows: unknown[], variables: unknown): ExternalListItem[] {
  const variableMeta = isRecord(variables) ? variables : {};
  return rows.map((row, index) => {
    assertCompactRowPresent(row, index, "External");
    const comment = parseCompactRowComment(row, index, "ext-comment");
    if (comment) {
      return comment;
    }

    if (Array.isArray(row)) {
      const [rawName, rawValue, rawDescription, rawUnit, rawType, rawId] = row;
      const name = stringValue(rawName, "");
      const meta = {
        ...(isRecord(variableMeta[name]) ? variableMeta[name] : {}),
        ...(rawDescription == null || rawDescription === "" ? {} : { description: String(rawDescription) }),
        ...(rawUnit == null || rawUnit === "" ? {} : { unit: String(rawUnit) }),
        ...(rawType == null || rawType === "" ? {} : { type: String(rawType) })
      };
      return {
        id: stringValue(rawId, `ext-${index}-${slugifyIdentifier(name)}`),
        name,
        ...(typeof meta.description === "string" ? { desc: meta.description } : {}),
        kind: "constant",
        valueText: String(rawValue),
        ...(buildUnitMeta(meta) ? { unitMeta: buildUnitMeta(meta) } : {})
      };
    }

    if (isRecord(row)) {
      const name = stringValue(row.name, "");
      const meta = {
        ...(isRecord(variableMeta[name]) ? variableMeta[name] : {}),
        ...(typeof row.desc === "string" ? { description: row.desc } : {}),
        ...(typeof row.description === "string" ? { description: row.description } : {}),
        ...(row.unit == null ? {} : { unit: String(row.unit) }),
        ...(row.type == null ? {} : { type: String(row.type) })
      };
      return {
        id: stringValue(row.id, `ext-${index}-${slugifyIdentifier(name)}`),
        name,
        ...(typeof meta.description === "string" ? { desc: meta.description } : {}),
        kind: row.kind === "series" ? "series" : "constant",
        valueText: stringValue(row.value ?? row.valueText, ""),
        ...(buildUnitMeta(meta) ? { unitMeta: buildUnitMeta(meta) } : {})
      };
    }

    throw new Error("Compact external rows must be arrays or row objects.");
  });
}

export function buildCompactInitialValues(initialValues: unknown): Extract<NotebookCell, { type: "initial-values" }>["initialValues"] {
  if (!isRecord(initialValues)) {
    return [];
  }

  return Object.entries(initialValues).map(([name, value], index) => ({
    id: `init-${index}-${slugifyIdentifier(name)}`,
    name,
    valueText: String(value)
  }));
}

export function parseCompactInitialValueRows(rows: unknown[]): InitialValueListItem[] {
  return rows.map((row, index) => {
    assertCompactRowPresent(row, index, "Initial value");
    const comment = parseCompactRowComment(row, index, "init-comment");
    if (comment) {
      return comment;
    }

    if (Array.isArray(row)) {
      const [rawName, rawValue, rawId] = row;
      const name = stringValue(rawName, "");
      return {
        id: stringValue(rawId, `init-${index}-${slugifyIdentifier(name)}`),
        name,
        valueText: String(rawValue)
      };
    }

    if (isRecord(row)) {
      const name = stringValue(row.name, "");
      return {
        id: stringValue(row.id, `init-${index}-${slugifyIdentifier(name)}`),
        name,
        valueText: stringValue(row.value ?? row.valueText, "")
      };
    }

    throw new Error("Compact initial-value rows must be arrays or row objects.");
  });
}

export function buildCompactMatrixCell(
  input: unknown,
  options: { fallbackColumns: unknown; id: string; sourceRunCellId?: string; title: string }
): Extract<NotebookCell, { type: "matrix" }> | null {
  if (!isRecord(input)) {
    return null;
  }

  const columns = stringArray(input.columns) ?? stringArray(options.fallbackColumns) ?? [];
  const sectors = stringArray(input.sectors);
  const rows = Array.isArray(input.rows)
    ? input.rows.map((row) => {
        if (Array.isArray(row)) {
          const [band, label, ...values] = row;
          return {
            band: String(band),
            label: String(label),
            values: values.map((value) => String(value))
          };
        }
        if (isRecord(row)) {
          return {
            ...(typeof row.band === "string" ? { band: row.band } : {}),
            label: stringValue(row.label, ""),
            values: stringArray(row.values) ?? []
          };
        }
        throw new Error("Compact matrix rows must be arrays or row objects.");
      })
    : [];

  const accountingKind = normalizeAccountingMatrixKindInput(input.accountingKind);
  const columnTree = parseMatrixColumnTree(input.columnTree);
  const columnBadges = parseMatrixColumnBadges(input.columnBadges);
  const variables = stringArray(input.variables);

  return normalizeMatrixCellAccountingKind({
    id: typeof input.id === "string" ? input.id : options.id,
    type: "matrix",
    title: typeof input.title === "string" ? input.title : options.title,
    ...(options.sourceRunCellId ? { sourceRunCellId: options.sourceRunCellId } : {}),
    ...(accountingKind ? { accountingKind } : {}),
    columns,
    ...(columnTree ? { columnTree } : {}),
    ...(columnBadges ? { columnBadges } : {}),
    ...(variables ? { variables } : {}),
    ...(sectors ? { sectors } : {}),
    rows,
    ...compactCellFlags(input)
  });
}

export function buildCompactSolverOptions(input: unknown): Extract<NotebookCell, { type: "solver" }>["options"] {
  const solver = isRecord(input) ? input : {};
  return {
    ...(solver.periods == null ? {} : { periods: numberValue(solver.periods, 50) }),
    solverMethod: normalizeSolverMethod(solver.method ?? solver.solverMethod),
    toleranceText: stringValue(solver.tolerance ?? solver.toleranceText, "1e-6"),
    maxIterations: numberValue(solver.maxIterations, 200),
    defaultInitialValueText: stringValue(solver.defaultInitialValue ?? solver.defaultInitialValueText, "1e-15"),
    hiddenLeftVariable: stringValue(solver.hiddenLeftVariable, ""),
    hiddenRightVariable: stringValue(solver.hiddenRightVariable, ""),
    hiddenToleranceText: stringValue(solver.hiddenTolerance ?? solver.hiddenToleranceText, "0.00001"),
    relativeHiddenTolerance: Boolean(solver.relativeHiddenTolerance)
  } as Extract<NotebookCell, { type: "solver" }>["options"];
}

export function buildCompactChartCells(charts: unknown, sourceRunCellId: string): Array<Extract<NotebookCell, { type: "chart" }>> {
  if (!Array.isArray(charts)) {
    return [];
  }

  return charts.filter(isRecord).map((chart, index) => ({
    id: typeof chart.id === "string" ? chart.id : `chart-${index + 1}`,
    type: "chart",
    title: typeof chart.title === "string" ? chart.title : `Chart ${index + 1}`,
    ...compactCellFlags(chart),
    sourceRunCellId,
    variables: stringArray(chart.variables) ?? [],
    ...(isRecord(chart.sharedRange) ? { sharedRange: chart.sharedRange as Extract<NotebookCell, { type: "chart" }>["sharedRange"] } : {}),
    ...(chart.axisMode === "shared" || chart.axisMode === "separate" ? { axisMode: chart.axisMode } : {}),
    ...(typeof chart.axisSnapTolarance === "number" ? { axisSnapTolarance: chart.axisSnapTolarance } : {}),
    ...(typeof chart.niceScale === "boolean" ? { niceScale: chart.niceScale } : {}),
    ...(chart.referenceTrace === "none" || chart.referenceTrace === "baseline" || chart.referenceTrace === "previous-run" ? { referenceTrace: chart.referenceTrace } : {}),
    ...(typeof chart.yAxisTickCount === "number" ? { yAxisTickCount: chart.yAxisTickCount } : {}),
    ...(isRecord(chart.seriesRanges) ? { seriesRanges: chart.seriesRanges as Extract<NotebookCell, { type: "chart" }>["seriesRanges"] } : {}),
    ...(Array.isArray(chart.timeRangeInclusive) ? { timeRangeInclusive: chart.timeRangeInclusive as [number, number] } : {})
  }));
}

export function buildCompactTableCells(tables: unknown, sourceRunCellId: string): Array<Extract<NotebookCell, { type: "table" }>> {
  if (!Array.isArray(tables)) {
    return [];
  }

  return tables.filter(isRecord).map((table, index) => ({
    id: typeof table.id === "string" ? table.id : `table-${index + 1}`,
    type: "table",
    title: typeof table.title === "string" ? table.title : `Table ${index + 1}`,
    ...(typeof table.note === "string" ? { note: table.note } : {}),
    ...(typeof table.description === "string" ? { description: table.description } : {}),
    ...(typeof table.collapsed === "boolean" ? { collapsed: table.collapsed } : {}),
    sourceRunCellId,
    variables: stringArray(table.variables) ?? []
  }));
}

export function resolveEquationRole(meta: Record<string, unknown>): EquationRow["role"] | undefined {
  if (typeof meta.role === "string") {
    return meta.role as EquationRow["role"];
  }
  if (meta.type === "stock") {
    return "accumulation";
  }
  if (meta.type === "flow") {
    return "identity";
  }
  return undefined;
}

export function buildUnitMeta(meta: Record<string, unknown>): EquationRow["unitMeta"] | undefined {
  const unit = typeof meta.unit === "string" ? meta.unit : undefined;
  const unitMeta = isRecord(meta.unitMeta) ? meta.unitMeta : undefined;
  if (unitMeta) {
    return unitMeta;
  }
  const stockFlow = meta.type === "stock" || meta.type === "flow" || meta.type === "aux" ? meta.type : undefined;
  const signature = unit ? parseCompactUnit(unit) : undefined;
  if (!stockFlow && !signature) {
    return undefined;
  }
  return {
    ...(stockFlow ? { stockFlow } : {}),
    ...(signature ? { signature } : {})
  };
}

export function parseCompactUnit(unit: string): Record<string, number> | undefined {
  const normalized = unit.trim();
  if (!normalized || normalized === "1") {
    return undefined;
  }
  if (normalized === "$") {
    return { money: 1 };
  }
  if (normalized === "$/year" || normalized === "$/yr") {
    return { money: 1, time: -1 };
  }
  if (normalized === "1/year" || normalized === "1/yr") {
    return { time: -1 };
  }
  if (normalized === "items/year" || normalized === "items/yr") {
    return { items: 1, time: -1 };
  }
  if (normalized === "$/item" || normalized === "$/items") {
    return { money: 1, items: -1 };
  }
  if (normalized === "year" || normalized === "yr") {
    return { time: 1 };
  }
  return undefined;
}

export function normalizeSolverMethod(value: unknown): "GAUSS_SEIDEL" | "BROYDEN" | "NEWTON" {
  const normalized = typeof value === "string" ? value.toUpperCase().replace(/-/g, "_") : "NEWTON";
  if (normalized === "GAUSS_SEIDEL" || normalized === "BROYDEN" || normalized === "NEWTON") {
    return normalized;
  }
  return "NEWTON";
}

