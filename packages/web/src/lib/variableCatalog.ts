import { equationDefinesVariable, type EquationRole } from "@sfcr/core";

import { buildDependencyGraph, type VariableType } from "../notebook/dependencyGraph";
import { buildEditorStateForNotebookModel, resolveRunCellModelKey } from "../notebook/modelSections";
import { resolveModelTitle } from "../notebook/assistantTools/shared";
import type { NotebookDocument, RunCell } from "../notebook/types";
import type { EditorState } from "./editorModel";
import { buildVariableDescriptions } from "./variableDescriptions";
import { buildVariableUnitMetadata, getVariableUnitText } from "./units";
import type { SimulationResult } from "@sfcr/core";

import type { StockFlowKind, UnitMeta } from "./unitMeta";
import type { InspectorModelSource } from "./variableInspect";
import { resolveInspectorModelSource } from "./variableInspect";
import type { NotebookAssistantSnapshot } from "../notebook/assistantTools/types";

export type VariableCatalogEndogenousExogenous =
  | "endogenous"
  | "exogenous"
  | "initial-only"
  | "unknown";

export type VariableCatalogValueSource = "run" | "external" | "initial" | "none";

export type VariableCatalogGroupBy =
  | "none"
  | "endogenousExogenous"
  | "variableType"
  | "stockFlow"
  | "unit"
  | "equationRole"
  | "model";

export interface VariableCatalogRow {
  name: string;
  description: string | null;
  value: number | null;
  valueSource: VariableCatalogValueSource;
  endogenousExogenous: VariableCatalogEndogenousExogenous;
  variableType: VariableType | null;
  stockFlow: StockFlowKind | null;
  unitText: string | null;
  equationRole: EquationRole | null;
  modelId: string;
  modelTitle: string;
  externalKind: "constant" | "series" | null;
  externalValueText: string | null;
  initialValue: number | null;
  currentDependencies: string[];
  lagDependencies: string[];
  modelSource: InspectorModelSource | null;
}

export interface CatalogModelContext {
  editor: EditorState;
  modelId: string;
  modelKey: string;
  modelTitle: string;
  modelSource: InspectorModelSource | null;
}

export function listCatalogModelContexts(document: NotebookDocument): CatalogModelContext[] {
  const contexts: CatalogModelContext[] = [];
  const seen = new Set<string>();

  for (const run of document.cells.filter((cell): cell is RunCell => cell.type === "run")) {
    const modelKey = resolveRunCellModelKey(document.cells, run);
    if (!modelKey || seen.has(modelKey)) {
      continue;
    }

    const editor = buildEditorStateForNotebookModel(document, run);
    if (!editor) {
      continue;
    }

    seen.add(modelKey);
    contexts.push({
      editor,
      modelId: modelKey.replace(/^model:/, "").replace(/^cell:/, ""),
      modelKey,
      modelTitle: resolveModelTitle(document, run) ?? run.title,
      modelSource: resolveInspectorModelSource(run)
    });
  }

  return contexts;
}

export function buildVariableCatalogRows(args: {
  document: NotebookDocument;
  currentValuesByModel?: Map<string, Record<string, number | undefined>>;
}): VariableCatalogRow[] {
  const rows: VariableCatalogRow[] = [];
  const seen = new Set<string>();

  for (const context of listCatalogModelContexts(args.document)) {
    const descriptions = buildVariableDescriptions({
      equations: context.editor.equations,
      externals: context.editor.externals
    });
    const unitMetadata = buildVariableUnitMetadata({
      equations: context.editor.equations,
      externals: context.editor.externals
    });
    const graph = buildDependencyGraph(context.editor);
    const currentValues = args.currentValuesByModel?.get(context.modelId);

    for (const node of graph.nodes) {
      if (seen.has(node.name)) {
        continue;
      }
      seen.add(node.name);

      const external = context.editor.externals.find((row) => row.name.trim() === node.name) ?? null;
      const initialValue = parseInitialValue(context.editor, node.name);
      const endogenousExogenous = deriveEndogenousExogenous({
        editor: context.editor,
        name: node.name,
        initialValue
      });
      const unitMeta = unitMetadata.get(node.name);
      const { value, valueSource } = resolveCatalogValue({
        currentValues,
        external,
        initialValue,
        name: node.name
      });

      rows.push({
        name: node.name,
        description: descriptions.get(node.name) ?? node.description ?? null,
        value,
        valueSource,
        endogenousExogenous,
        variableType: node.variableType ?? (external ? "exogenous" : null),
        stockFlow: unitMeta?.stockFlow ?? null,
        unitText: getVariableUnitText(unitMetadata, node.name) || null,
        equationRole: node.equationRole ?? null,
        modelId: context.modelId,
        modelTitle: context.modelTitle,
        externalKind: external?.kind ?? null,
        externalValueText: external?.valueText ?? null,
        initialValue,
        currentDependencies: [...node.currentDependencyNames],
        lagDependencies: [...node.lagDependencyNames],
        modelSource: context.modelSource
      });
    }
  }

  return rows.sort((left, right) => left.name.localeCompare(right.name));
}

export function catalogRowGroupKey(
  row: VariableCatalogRow,
  groupBy: VariableCatalogGroupBy
): string {
  switch (groupBy) {
    case "none":
      return "";
    case "endogenousExogenous":
      return formatEndogenousExogenousLabel(row.endogenousExogenous);
    case "variableType":
      return row.variableType ?? "Unknown";
    case "stockFlow":
      return row.stockFlow ?? "Unspecified";
    case "unit":
      return row.unitText?.trim() || "No unit";
    case "equationRole":
      return row.equationRole ?? "None";
    case "model":
      return row.modelTitle;
    default:
      return "";
  }
}

export function buildCurrentValuesByModel(args: {
  document: NotebookDocument;
  getResult: (runCellId: string) => SimulationResult | null;
  selectedPeriodIndex: number;
}): Map<string, Record<string, number | undefined>> {
  const valuesByModel = new Map<string, Record<string, number | undefined>>();

  for (const context of listCatalogModelContexts(args.document)) {
    const runCell = findLatestRunForModelKey(args.document, context.modelKey);
    if (!runCell) {
      continue;
    }

    const result = args.getResult(runCell.id);
    if (!result) {
      continue;
    }

    valuesByModel.set(
      context.modelId,
      Object.fromEntries(
        Object.entries(result.series).map(([name, values]) => [
          name,
          values[Math.min(args.selectedPeriodIndex, Math.max(values.length - 1, 0))]
        ])
      )
    );
  }

  return valuesByModel;
}

export function buildCurrentValuesByModelFromSnapshot(
  snapshot: NotebookAssistantSnapshot,
  selectedPeriodIndex = snapshot.selectedPeriodIndex
): Map<string, Record<string, number | undefined>> {
  return buildCurrentValuesByModel({
    document: snapshot.document,
    getResult: (runCellId) => {
      const output = snapshot.runtime.outputs[runCellId];
      return output?.type === "result" ? output.result : null;
    },
    selectedPeriodIndex
  });
}

export function catalogRowToAssistantEntry(row: VariableCatalogRow, unitMeta: UnitMeta | undefined) {
  return {
    variable: row.name,
    modelId: row.modelId,
    modelTitle: row.modelTitle,
    description: row.description,
    unitText: row.unitText,
    unitMeta,
    variableType: row.variableType,
    equationRole: row.equationRole,
    currentDependencies: row.currentDependencies,
    lagDependencies: row.lagDependencies,
    initialValue: row.initialValue,
    externalKind: row.externalKind,
    externalValueText: row.externalValueText
  };
}

export function findLatestRunForModelKey(document: NotebookDocument, modelKey: string): RunCell | null {
  let latest: RunCell | null = null;

  for (const cell of document.cells) {
    if (cell.type !== "run") {
      continue;
    }

    const cellModelKey = resolveRunCellModelKey(document.cells, cell);
    if (cellModelKey === modelKey) {
      latest = cell;
    }
  }

  return latest;
}

function deriveEndogenousExogenous(args: {
  editor: EditorState;
  name: string;
  initialValue: number | null;
}): VariableCatalogEndogenousExogenous {
  const hasDefiningEquation = args.editor.equations.some((equation) =>
    equationDefinesVariable(equation.name, args.name)
  );
  if (hasDefiningEquation) {
    return "endogenous";
  }

  const external = args.editor.externals.find((row) => row.name.trim() === args.name);
  if (external) {
    return "exogenous";
  }

  if (args.initialValue != null) {
    return "initial-only";
  }

  return "unknown";
}

function parseInitialValue(editor: EditorState, name: string): number | null {
  const row = editor.initialValues.find((entry) => entry.name.trim() === name);
  if (!row) {
    return null;
  }

  const parsed = Number(row.valueText.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveCatalogValue(args: {
  name: string;
  currentValues?: Record<string, number | undefined>;
  external: EditorState["externals"][number] | null;
  initialValue: number | null;
}): { value: number | null; valueSource: VariableCatalogValueSource } {
  const runValue = args.currentValues?.[args.name];
  if (runValue !== undefined && Number.isFinite(runValue)) {
    return { value: runValue, valueSource: "run" };
  }

  if (args.external?.kind === "constant") {
    const parsed = Number(args.external.valueText.trim());
    if (Number.isFinite(parsed)) {
      return { value: parsed, valueSource: "external" };
    }
  }

  if (args.initialValue != null) {
    return { value: args.initialValue, valueSource: "initial" };
  }

  return { value: null, valueSource: "none" };
}

function formatEndogenousExogenousLabel(value: VariableCatalogEndogenousExogenous): string {
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
