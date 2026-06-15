import {
  analyzeParsedEquation,
  derivativeBalanceStockName,
  equationDefinesVariable,
  equationOutputVariable,
  isDerivativeBalanceTarget,
  parseEquation,
  parseExpression,
  type EquationRole
} from "@sfcr/core";
import { isRowComment } from "@sfcr/notebook-core";

import type {
  EditorState,
  EquationRow,
  ExternalRow,
  InitialValueListItem,
  InitialValueRow
} from "./editorModel";
import type { NotebookCell } from "../notebook/types";
import { buildDerivedAccountingTermsFromCells } from "../notebook/derivedAccountingTerms";
import {
  evaluateMatrixColumnSumAtPeriod,
  resolveMatrixColumnSumInspectContext,
  resolveMatrixColumnSumBindingsForRef
} from "../notebook/matrixColumnSumRuntime";
import type { VariableDescriptions } from "./variableDescriptions";
import type { VariableUnitMetadata } from "./unitMeta";
import {
  explainDerivativeBalanceEquation,
  explainEquationExpression
} from "./equationExplanation";
import { getVariableUnitText } from "./units";
import type { SimulationResult } from "@sfcr/core";
import { resolveInspectorModelSource, type InspectorModelSource } from "./variableInspect";

export interface VariableInspectorData {
  name: string;
  description?: string;
  unitLabel?: string | null;
  parameterNames: string[];
  kind: "equation" | "external" | "initial-only" | "matrix-column-sum" | "unknown";
  roleLabel: string;
  roleSummary: string;
  equationRoleLabel: string | null;
  equationRoleSourceLabel: string | null;
  currentValue?: number;
  initialValue?: number;
  definingEquation: EquationRow | null;
  generatedEquationExplanation: string | null;
  matrixColumnSum?: {
    columnRef: string;
    expression: string;
    sources: string[];
    stockVariable: string | null;
  };
  equationInputs: {
    current: string[];
    lagged: string[];
  };
  affectedBy: string[];
  affects: string[];
  affectsAccountingTerms: string[];
  appearsInEquations: EquationRow[];
  relatedEquations: Array<{
    equation: EquationRow;
    role: "root" | "input" | "output" | "both";
    tokenRoles: Map<string, "root" | "input" | "output" | "both">;
  }>;
  externalDefinition: ExternalRow | null;
  isStockFlowLabel: string | null;
}

interface EquationAnalysis {
  currentDependencies: string[];
  lagDependencies: string[];
}

type InspectorTraceRole = "root" | "input" | "output" | "both";

export function buildVariableInspectorData(args: {
  currentValues?: Record<string, number | undefined>;
  editor: EditorState;
  notebookCells?: NotebookCell[];
  modelSource?: InspectorModelSource | null;
  sourceRunCellId?: string | null;
  getResult?: (runCellId: string) => SimulationResult | null;
  selectedVariable: string | null;
  variableDescriptions: VariableDescriptions;
  variableUnitMetadata: VariableUnitMetadata;
}): VariableInspectorData | null {
  const selectedVariable = args.selectedVariable?.trim() ?? "";
  if (!selectedVariable) {
    return null;
  }

  const matrixColumnSumContext = resolveMatrixColumnSumInspectorContext(args, selectedVariable);

  const equationAnalysis = buildEquationAnalysis(
    args.editor.equations.filter((equation): equation is EquationRow => !isRowComment(equation))
  );
  const definingEquation =
    args.editor.equations.find(
      (equation): equation is EquationRow =>
        !isRowComment(equation) && equationDefinesVariable(equation.name, selectedVariable)
    ) ?? null;
  const externalDefinition =
    args.editor.externals.find(
      (external): external is ExternalRow =>
        !isRowComment(external) && external.name.trim() === selectedVariable
    ) ?? null;
  const initialValue = findInitialValue(args.editor.initialValues, selectedVariable);
  const appearsInEquations = args.editor.equations.filter((equation): equation is EquationRow => {
    if (isRowComment(equation)) {
      return false;
    }
    if (equationDefinesVariable(equation.name, selectedVariable)) {
      return false;
    }
    const analysis = equationAnalysis.get(equation.id);
    return Boolean(
      analysis?.currentDependencies.includes(selectedVariable) ||
        analysis?.lagDependencies.includes(selectedVariable)
    );
  });

  const equationInputs = definingEquation
    ? equationAnalysis.get(definingEquation.id) ?? { currentDependencies: [], lagDependencies: [] }
    : matrixColumnSumContext
      ? {
          currentDependencies: matrixColumnSumContext.currentDependencies,
          lagDependencies: matrixColumnSumContext.lagDependencies
        }
      : { currentDependencies: [], lagDependencies: [] };

  const affectedBy = uniqueSorted([
    ...equationInputs.currentDependencies,
    ...equationInputs.lagDependencies
  ]);
  const affects = uniqueSorted(appearsInEquations.map((equation) => equation.name.trim()));
  const affectsAccountingTerms = uniqueSorted(
    buildDerivedAccountingTermsFromCells(args.notebookCells ?? [])
      .filter((term) => term.canonicalVariable === selectedVariable)
      .map((term) => term.label)
  );
  const description =
    args.variableDescriptions.get(selectedVariable) ??
    definingEquation?.desc?.trim() ??
    externalDefinition?.desc?.trim() ??
    (matrixColumnSumContext
      ? matrixColumnSumContext.stockVariable
        ? `Matrix column sum for ${selectedVariable}, linked to stock ${matrixColumnSumContext.stockVariable}.`
        : `Matrix column sum for ${selectedVariable} from the linked account-transactions matrix.`
      : undefined);
  const unitMeta = args.variableUnitMetadata.get(selectedVariable);
  const stockFlow = unitMeta?.stockFlow ?? null;
  const unitLabel = getVariableUnitText(args.variableUnitMetadata, selectedVariable);
  const currentValue =
    args.currentValues?.[selectedVariable] ??
    (matrixColumnSumContext?.currentValue != null ? matrixColumnSumContext.currentValue : undefined);

  const kind = definingEquation
    ? "equation"
    : externalDefinition
      ? "external"
      : matrixColumnSumContext
        ? "matrix-column-sum"
        : initialValue != null
          ? "initial-only"
          : "unknown";

  const generatedEquationExplanation = definingEquation
    ? buildGeneratedEquationExplanation(definingEquation, args.variableDescriptions)
    : matrixColumnSumContext
      ? `This period's net flow through ${selectedVariable} is the sum of the linked account-transactions column entries.`
      : null;
  const equationRoleMeta = definingEquation
    ? buildEquationRoleMeta(definingEquation)
    : { label: null, sourceLabel: null };
  const parameterNames = uniqueSorted(
    args.editor.externals.flatMap((external) =>
      isRowComment(external) ? [] : [external.name.trim()]
    )
  );
  const relatedEquations = buildRelatedEquations({
    editor: args.editor,
    equationAnalysis,
    equationInputs,
    appearsInEquations,
    definingEquation,
    selectedVariable
  });

  return {
    name: selectedVariable,
    description,
    unitLabel,
    parameterNames,
    kind,
    roleLabel: formatRoleLabel(kind),
    roleSummary: buildRoleSummary({
      affectedByCount: affectedBy.length,
      affectsCount: affects.length,
      kind,
      stockFlow
    }),
    equationRoleLabel: equationRoleMeta.label,
    equationRoleSourceLabel: equationRoleMeta.sourceLabel,
    currentValue,
    initialValue,
    definingEquation,
    generatedEquationExplanation,
    matrixColumnSum: matrixColumnSumContext
      ? {
          columnRef: matrixColumnSumContext.columnRef,
          expression: matrixColumnSumContext.expression,
          sources: matrixColumnSumContext.sources,
          stockVariable: matrixColumnSumContext.stockVariable
        }
      : undefined,
    equationInputs: {
      current: equationInputs.currentDependencies,
      lagged: equationInputs.lagDependencies
    },
    affectedBy,
    affects,
    affectsAccountingTerms,
    appearsInEquations,
    relatedEquations,
    externalDefinition,
    isStockFlowLabel: stockFlow ? capitalize(stockFlow) : null
  };
}

function buildRelatedEquations(args: {
  editor: EditorState;
  equationAnalysis: Map<string, EquationAnalysis>;
  equationInputs: EquationAnalysis;
  appearsInEquations: EquationRow[];
  definingEquation: EquationRow | null;
  selectedVariable: string;
}): VariableInspectorData["relatedEquations"] {
  const rowsByOutput = new Map<string, EquationRow[]>();
  args.editor.equations.forEach((equation) => {
    if (isRowComment(equation)) {
      return;
    }
    const output = equationOutputVariable(equation.name);
    if (!output) {
      return;
    }
    rowsByOutput.set(output, [...(rowsByOutput.get(output) ?? []), equation]);
  });

  const entries = new Map<
    string,
    {
      equation: EquationRow;
      role: InspectorTraceRole;
      tokenRoles: Map<string, InspectorTraceRole>;
      order: number;
    }
  >();

  const orderById = new Map(args.editor.equations.map((equation, index) => [equation.id, index]));

  function addEntry(
    equation: EquationRow,
    role: InspectorTraceRole,
    tokenAssignments: Array<[string, InspectorTraceRole]>
  ): void {
    const existing = entries.get(equation.id);
    const tokenRoles = existing?.tokenRoles ?? new Map<string, InspectorTraceRole>();
    tokenAssignments.forEach(([token, tokenRole]) => {
      const normalizedToken = token.trim();
      if (!normalizedToken) {
        return;
      }
      tokenRoles.set(
        normalizedToken,
        mergeInspectorTraceRole(tokenRoles.get(normalizedToken), tokenRole)
      );
    });

    entries.set(equation.id, {
      equation,
      role: mergeInspectorTraceRole(existing?.role, role),
      tokenRoles,
      order: orderById.get(equation.id) ?? Number.MAX_SAFE_INTEGER
    });
  }

  if (args.definingEquation) {
    const definingAnalysis = args.equationAnalysis.get(args.definingEquation.id);
    const definingName = args.definingEquation.name.trim();
    const rootTokens: Array<[string, InspectorTraceRole]> = [[args.selectedVariable, "root"]];
    if (definingName && definingName !== args.selectedVariable) {
      rootTokens.push([definingName, "root"]);
    }
    addEntry(args.definingEquation, "root", [
      ...rootTokens,
      ...((definingAnalysis?.currentDependencies ?? []).map(
        (token): [string, InspectorTraceRole] => [token, "input"]
      )),
      ...((definingAnalysis?.lagDependencies ?? []).map(
        (token): [string, InspectorTraceRole] => [token, "input"]
      ))
    ]);

    uniqueSorted([
      ...args.equationInputs.currentDependencies,
      ...args.equationInputs.lagDependencies
    ]).forEach((dependency) => {
      (rowsByOutput.get(dependency) ?? []).forEach((equation) => {
        const output = equationOutputVariable(equation.name);
        addEntry(equation, "input", [
          [dependency, "input"],
          ...(output ? ([[output, "input"]] as Array<[string, InspectorTraceRole]>) : [])
        ]);
      });
    });
  }

  args.appearsInEquations.forEach((equation) => {
    addEntry(equation, "output", [
      [args.selectedVariable, "output"],
      [equation.name.trim(), "output"]
    ]);
  });

  return [...entries.values()]
    .sort((left, right) => left.order - right.order)
    .map(({ equation, role, tokenRoles }) => ({ equation, role, tokenRoles }));
}

function buildGeneratedEquationExplanation(
  equation: EquationRow,
  variableDescriptions: VariableDescriptions
): string | null {
  const name = equation.name.trim();
  const expression = equation.expression.trim();
  if (!name || !expression) {
    return null;
  }

  try {
    if (isDerivativeBalanceTarget(name)) {
      const stockName = derivativeBalanceStockName(name);
      if (!stockName) {
        return null;
      }
      const rhsExpression = parseExpression(expression);
      return explainDerivativeBalanceEquation(stockName, rhsExpression, variableDescriptions);
    }

    const parsed = parseEquation(name, expression);
    return explainEquationExpression(name, parsed.sourceExpression, variableDescriptions);
  } catch {
    return null;
  }
}

function buildEquationRoleMeta(equation: EquationRow): {
  label: string | null;
  sourceLabel: string | null;
} {
  const name = equation.name.trim();
  const expression = equation.expression.trim();
  if (!name || !expression) {
    return { label: null, sourceLabel: null };
  }

  try {
    const parsed = parseEquation(name, expression);
    const analysis = analyzeParsedEquation(parsed, {
      description: equation.desc?.trim(),
      explicitRole: equation.role
    });
    return {
      label: formatEquationRole(analysis.role),
      sourceLabel: equation.role ? "Declared" : "Inferred"
    };
  } catch {
    return equation.role
      ? { label: formatEquationRole(equation.role), sourceLabel: "Declared" }
      : { label: null, sourceLabel: null };
  }
}

function buildEquationAnalysis(equations: EquationRow[]): Map<string, EquationAnalysis> {
  const analysis = new Map<string, EquationAnalysis>();

  for (const equation of equations) {
    const name = equation.name.trim();
    const expression = equation.expression.trim();
    if (!name || !expression) {
      continue;
    }

    try {
      const parsed = parseEquation(name, expression);
      analysis.set(equation.id, {
        currentDependencies: parsed.currentDependencies,
        lagDependencies: parsed.lagDependencies
      });
    } catch {
      analysis.set(equation.id, {
        currentDependencies: [],
        lagDependencies: []
      });
    }
  }

  return analysis;
}

function findInitialValue(
  initialValues: InitialValueListItem[],
  variableName: string
): number | undefined {
  const row = initialValues.find(
    (initial) => !isRowComment(initial) && initial.name.trim() === variableName
  );
  if (!row || isRowComment(row)) {
    return undefined;
  }
  const value = Number(row.valueText);
  return Number.isFinite(value) ? value : undefined;
}

function buildRoleSummary(args: {
  affectedByCount: number;
  affectsCount: number;
  kind: VariableInspectorData["kind"];
  stockFlow: string | null;
}): string {
  const typeFragment = args.stockFlow ? `${args.stockFlow} variable` : "model variable";

  if (args.kind === "matrix-column-sum") {
    return `This matrix column sum aggregates ${pluralize(args.affectedByCount, "linked flow term")} from the account-transactions matrix.`;
  }

  if (args.kind === "external") {
    return `This exogenous ${typeFragment} feeds ${pluralize(args.affectsCount, "downstream equation")} in the current model.`;
  }

  if (args.kind === "initial-only") {
    return `This variable currently appears only as an initial condition and does not have an explicit defining equation.`;
  }

  if (args.kind === "equation") {
    return `This endogenous ${typeFragment} is driven by ${pluralize(args.affectedByCount, "upstream variable")} and feeds ${pluralize(args.affectsCount, "downstream equation")}.`;
  }

  return `This variable is referenced in the model, but its role is not fully defined yet.`;
}

function formatRoleLabel(kind: VariableInspectorData["kind"]): string {
  switch (kind) {
    case "equation":
      return "Endogenous";
    case "external":
      return "Exogenous";
    case "initial-only":
      return "Initial condition";
    case "matrix-column-sum":
      return "Matrix column sum";
    default:
      return "Unresolved";
  }
}

function resolveMatrixColumnSumInspectorContext(
  args: {
    notebookCells?: NotebookCell[];
    modelSource?: InspectorModelSource | null;
    sourceRunCellId?: string | null;
    getResult?: (runCellId: string) => SimulationResult | null;
    currentValues?: Record<string, number | undefined>;
  },
  selectedVariable: string
): (ReturnType<typeof resolveMatrixColumnSumInspectContext> & { currentValue?: number }) | null {
  if (!args.notebookCells?.length || !args.modelSource) {
    return null;
  }

  const modelId =
    "sourceModelId" in args.modelSource ? args.modelSource.sourceModelId.trim() : "";
  const runCellId = args.sourceRunCellId?.trim() ?? "";
  if (!modelId || !runCellId) {
    return null;
  }

  const context = resolveMatrixColumnSumInspectContext({
    cells: args.notebookCells,
    modelId,
    runCellId,
    columnRef: selectedVariable
  });
  if (!context) {
    return null;
  }

  const cachedValue = args.currentValues?.[selectedVariable];
  if (cachedValue != null && Number.isFinite(cachedValue)) {
    return { ...context, currentValue: cachedValue };
  }

  const result = args.getResult?.(runCellId) ?? null;
  if (!result) {
    return context;
  }

  const bindings = resolveMatrixColumnSumBindingsForRef({
    cells: args.notebookCells,
    modelId,
    runCellId,
    columnRef: selectedVariable
  });
  const periodIndex = Math.max(result.options.periods, 0);
  const currentValue = evaluateMatrixColumnSumAtPeriod(
    selectedVariable,
    bindings,
    result,
    periodIndex
  );
  return currentValue == null ? context : { ...context, currentValue };
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function mergeInspectorTraceRole(
  currentRole: InspectorTraceRole | undefined,
  nextRole: InspectorTraceRole
): InspectorTraceRole {
  if (!currentRole || currentRole === nextRole) {
    return nextRole;
  }
  if (currentRole === "both" || nextRole === "both") {
    return "both";
  }
  if (currentRole === "root") {
    return nextRole === "root" ? "root" : nextRole;
  }
  if (nextRole === "root") {
    return currentRole;
  }
  return "both";
}

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function capitalize(value: string): string {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

function formatEquationRole(role: EquationRole): string {
  switch (role) {
    case "accumulation":
      return "Accumulation";
    case "identity":
      return "Identity";
    case "target":
      return "Target";
    case "definition":
      return "Definition";
    case "behavioral":
      return "Behavioral";
  }
}
