import {
  analyzeParsedEquation,
  derivativeBalanceStockName,
  equationDefinesVariable,
  equationOutputVariable,
  isDerivativeBalanceTarget,
  parseEquation,
  parseExpression,
  type EquationRole,
  type MatrixColumnSumBindings
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
  collectImplicitMatrixAccumulationEquations,
  resolveImplicitMatrixAccumulationEquation,
  resolveMatrixColumnAccumulationFlowWarning,
  resolveMatrixColumnSumBindings,
  resolveMatrixColumnSumInspectContext,
  resolveMatrixColumnSumBindingsForRef
} from "../notebook/matrixColumnSumRuntime";
import {
  formatMatrixIntegralEquation,
  parseMatrixIntegralInspectVariable
} from "../notebook/matrixAccountSumRow";
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
  kind: "equation" | "external" | "initial-only" | "matrix-column-sum" | "matrix-column-integral" | "unknown";
  roleLabel: string;
  roleSummary: string;
  equationRoleLabel: string | null;
  equationRoleSourceLabel: string | null;
  currentValue?: number;
  initialValue?: number;
  definingEquation: EquationRow | null;
  isImplicitEquation: boolean;
  generatedEquationExplanation: string | null;
  matrixColumnSum?: {
    columnRef: string;
    expression: string;
    sources: string[];
    stockVariable: string | null;
  };
  matrixColumnIntegral?: {
    columnRef: string;
    expression: string;
    sources: string[];
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
    /** Hop distance from the selected variable. Direct neighbors are 1. */
    depth: number;
    tokenRoles: Map<string, "root" | "input" | "output" | "both">;
  }>;
  externalDefinition: ExternalRow | null;
  hasObservedData: boolean;
  isStockFlowLabel: string | null;
}

/** Upstream equations deeper than this are hidden until the inspector expand control is used. */
export const RELATED_EQUATIONS_INITIAL_UPSTREAM_DEPTH = 2;

interface EquationAnalysis {
  currentDependencies: string[];
  lagDependencies: string[];
}

type InspectorTraceRole = "root" | "input" | "output" | "both";

/**
 * Enumerate the variables a user can inspect for a given model editor scope:
 * equation outputs, external/observed inputs, and seeded initial values.
 * Returns a de-duplicated, alphabetically sorted list.
 */
export function collectInspectorVariableNames(editor: EditorState): string[] {
  const names = new Set<string>();

  for (const equation of editor.equations) {
    if (isRowComment(equation)) {
      continue;
    }
    const output = equationOutputVariable(equation.name) ?? equation.name.trim();
    if (output) {
      names.add(output);
    }
  }

  for (const external of editor.externals) {
    if (isRowComment(external)) {
      continue;
    }
    const name = external.name.trim();
    if (name) {
      names.add(name);
    }
  }

  for (const initialValue of editor.initialValues) {
    if (isRowComment(initialValue)) {
      continue;
    }
    const name = initialValue.name.trim();
    if (name) {
      names.add(name);
    }
  }

  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

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

  const integralColumnRef = parseMatrixIntegralInspectVariable(selectedVariable);
  const matrixColumnSumSelectedVariable = integralColumnRef ?? selectedVariable;

  const inspectorRuntime = resolveInspectorRuntimeContext(args);
  const matrixColumnSumContext = resolveMatrixColumnSumInspectorContext(
    args,
    matrixColumnSumSelectedVariable
  );

  const explicitEquations = args.editor.equations.filter(
    (equation): equation is EquationRow => !isRowComment(equation)
  );
  const explicitEquationNames = new Set(
    explicitEquations.map((equation) => equationOutputVariable(equation.name) ?? equation.name.trim())
  );
  const equationAnalysis = buildEquationAnalysis(explicitEquations, inspectorRuntime?.matrixColumnSums);
  const definingEquation =
    explicitEquations.find((equation) => equationDefinesVariable(equation.name, selectedVariable)) ??
    null;
  const implicitAccumulation =
    !definingEquation && inspectorRuntime
      ? resolveImplicitMatrixAccumulationEquation({
          cells: inspectorRuntime.cells,
          modelId: inspectorRuntime.modelId,
          runCellId: inspectorRuntime.runCellId,
          variable: selectedVariable,
          existingEquationNames: explicitEquationNames
        })
      : null;
  const effectiveDefiningEquation =
    definingEquation ??
    (implicitAccumulation
      ? ({
          id: `implicit-matrix-${implicitAccumulation.name}`,
          name: implicitAccumulation.name,
          expression: implicitAccumulation.expression,
          role: implicitAccumulation.role,
          desc: "Implicit accumulation from account-transactions matrix Sum row"
        } satisfies EquationRow)
      : null);
  const isImplicitEquation = definingEquation == null && implicitAccumulation != null;
  const externalDefinition =
    args.editor.externals.find(
      (external): external is ExternalRow =>
        !isRowComment(external) && external.name.trim() === selectedVariable
    ) ?? null;
  const hasObservedData = args.editor.externals.some(
    (external): external is ExternalRow =>
      !isRowComment(external) &&
      external.name.trim() === selectedVariable &&
      external.observed === true
  );
  const initialValue = findInitialValue(args.editor.initialValues, selectedVariable);
  const appearsInEquations = explicitEquations.filter((equation) => {
    if (equationDefinesVariable(equation.name, selectedVariable)) {
      return false;
    }
    const analysis = equationAnalysis.get(equation.id);
    return Boolean(
      analysis?.currentDependencies.includes(selectedVariable) ||
        analysis?.lagDependencies.includes(selectedVariable)
    );
  });

  const effectiveEquationAnalysis =
    effectiveDefiningEquation && !equationAnalysis.has(effectiveDefiningEquation.id)
      ? parseEquationAnalysis(effectiveDefiningEquation, inspectorRuntime?.matrixColumnSums)
      : null;

  const equationInputs = effectiveDefiningEquation
    ? equationAnalysis.get(effectiveDefiningEquation.id) ??
      effectiveEquationAnalysis ?? { currentDependencies: [], lagDependencies: [] }
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
    effectiveDefiningEquation?.desc?.trim() ??
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

  const kind = effectiveDefiningEquation
    ? "equation"
    : externalDefinition
      ? "external"
      : integralColumnRef
        ? "matrix-column-integral"
        : matrixColumnSumContext
          ? "matrix-column-sum"
          : initialValue != null
            ? "initial-only"
            : "unknown";

  const generatedEquationExplanation = (() => {
    if (integralColumnRef) {
      return "This integrated column level accumulates flow entries from the linked account-transactions matrix. Name a stock in the Sum row to add it to the model.";
    }

    const base = effectiveDefiningEquation
      ? buildGeneratedEquationExplanation(
          effectiveDefiningEquation,
          args.variableDescriptions,
          inspectorRuntime?.matrixColumnSums
        )
      : matrixColumnSumContext
        ? `This period's net flow through ${selectedVariable} is the sum of the linked account-transactions column entries.`
        : null;

    if (!base || !isImplicitEquation || !inspectorRuntime) {
      return base;
    }

    const flowWarning = resolveMatrixColumnAccumulationFlowWarning({
      cells: inspectorRuntime.cells,
      modelId: inspectorRuntime.modelId,
      runCellId: inspectorRuntime.runCellId,
      stockVariable: selectedVariable
    });
    return flowWarning ? `${base} ${flowWarning}` : base;
  })();
  const equationRoleMeta = effectiveDefiningEquation
    ? buildEquationRoleMeta(effectiveDefiningEquation, isImplicitEquation)
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
    definingEquation: effectiveDefiningEquation,
    selectedVariable
  });

  return {
    name: integralColumnRef ? "∫" : selectedVariable,
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
    definingEquation: effectiveDefiningEquation,
    isImplicitEquation,
    generatedEquationExplanation,
    matrixColumnSum: matrixColumnSumContext && !integralColumnRef
      ? {
          columnRef: matrixColumnSumContext.columnRef,
          expression: matrixColumnSumContext.expression,
          sources: matrixColumnSumContext.sources,
          stockVariable: matrixColumnSumContext.stockVariable
        }
      : undefined,
    matrixColumnIntegral: integralColumnRef
      ? {
          columnRef: integralColumnRef,
          expression: formatMatrixIntegralEquation(integralColumnRef),
          sources: matrixColumnSumContext?.sources ?? []
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
    hasObservedData,
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
      depth: number;
      tokenRoles: Map<string, InspectorTraceRole>;
      order: number;
    }
  >();

  const orderById = new Map(args.editor.equations.map((equation, index) => [equation.id, index]));

  function addEntry(
    equation: EquationRow,
    role: InspectorTraceRole,
    tokenAssignments: Array<[string, InspectorTraceRole]>,
    depth: number
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
      depth: existing ? Math.min(existing.depth, depth) : depth,
      tokenRoles,
      order: orderById.get(equation.id) ?? Number.MAX_SAFE_INTEGER
    });
  }

  if (args.definingEquation) {
    // Transitive upstream (BFS). Omit the selected variable's own defining equation.
    const queue: Array<{ variable: string; depth: number }> = [];
    const queuedVariables = new Set<string>();
    const visitedEquationIds = new Set<string>();

    function enqueueVariable(variable: string, depth: number): void {
      const normalized = variable.trim();
      if (!normalized || normalized === args.selectedVariable || queuedVariables.has(normalized)) {
        return;
      }
      queuedVariables.add(normalized);
      queue.push({ variable: normalized, depth });
    }

    uniqueSorted([
      ...args.equationInputs.currentDependencies,
      ...args.equationInputs.lagDependencies
    ]).forEach((dependency) => {
      enqueueVariable(dependency, 1);
    });

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) {
        break;
      }

      (rowsByOutput.get(current.variable) ?? []).forEach((equation) => {
        if (equationDefinesVariable(equation.name, args.selectedVariable)) {
          return;
        }
        if (visitedEquationIds.has(equation.id)) {
          return;
        }
        visitedEquationIds.add(equation.id);

        const output = equationOutputVariable(equation.name);
        addEntry(
          equation,
          "input",
          [
            [current.variable, "input"],
            ...(output ? ([[output, "input"]] as Array<[string, InspectorTraceRole]>) : [])
          ],
          current.depth
        );

        const analysis = args.equationAnalysis.get(equation.id);
        uniqueSorted([
          ...(analysis?.currentDependencies ?? []),
          ...(analysis?.lagDependencies ?? [])
        ]).forEach((dependency) => {
          enqueueVariable(dependency, current.depth + 1);
        });
      });
    }
  }

  args.appearsInEquations.forEach((equation) => {
    addEntry(
      equation,
      "output",
      [
        [args.selectedVariable, "output"],
        [equation.name.trim(), "output"]
      ],
      1
    );
  });

  return [...entries.values()]
    .sort((left, right) => {
      const roleDelta = relatedEquationRoleSortKey(left.role) - relatedEquationRoleSortKey(right.role);
      if (roleDelta !== 0) {
        return roleDelta;
      }
      if (left.depth !== right.depth) {
        return left.depth - right.depth;
      }
      return left.order - right.order;
    })
    .map(({ equation, role, depth, tokenRoles }) => ({ equation, role, depth, tokenRoles }));
}

function relatedEquationRoleSortKey(role: InspectorTraceRole): number {
  switch (role) {
    case "input":
      return 0;
    case "both":
      return 1;
    case "output":
      return 2;
    case "root":
      return 3;
  }
}

export function isRelatedEquationInitiallyVisible(entry: {
  role: InspectorTraceRole;
  depth: number;
}): boolean {
  if (entry.role === "output" || entry.role === "both") {
    return true;
  }
  return entry.depth <= RELATED_EQUATIONS_INITIAL_UPSTREAM_DEPTH;
}

function buildGeneratedEquationExplanation(
  equation: EquationRow,
  variableDescriptions: VariableDescriptions,
  matrixColumnSums?: MatrixColumnSumBindings
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

    const parsed = parseEquation(name, expression, { matrixColumnSums });
    return explainEquationExpression(name, parsed.sourceExpression, variableDescriptions);
  } catch {
    return null;
  }
}

function buildEquationRoleMeta(
  equation: EquationRow,
  isImplicitEquation = false
): {
  label: string | null;
  sourceLabel: string | null;
} {
  const name = equation.name.trim();
  const expression = equation.expression.trim();
  if (!name || !expression) {
    return { label: null, sourceLabel: null };
  }

  if (isImplicitEquation) {
    return {
      label: formatEquationRole(equation.role ?? "accumulation"),
      sourceLabel: "From matrix Sum row"
    };
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

function buildEquationAnalysis(
  equations: EquationRow[],
  matrixColumnSums?: MatrixColumnSumBindings
): Map<string, EquationAnalysis> {
  const analysis = new Map<string, EquationAnalysis>();

  for (const equation of equations) {
    const parsedAnalysis = parseEquationAnalysis(equation, matrixColumnSums);
    if (parsedAnalysis) {
      analysis.set(equation.id, parsedAnalysis);
    }
  }

  return analysis;
}

function parseEquationAnalysis(
  equation: EquationRow,
  matrixColumnSums?: MatrixColumnSumBindings
): EquationAnalysis | null {
  const name = equation.name.trim();
  const expression = equation.expression.trim();
  if (!name || !expression) {
    return null;
  }

  try {
    const parsed = parseEquation(name, expression, { matrixColumnSums });
    return {
      currentDependencies: parsed.currentDependencies,
      lagDependencies: parsed.lagDependencies
    };
  } catch {
    return {
      currentDependencies: [],
      lagDependencies: []
    };
  }
}

interface InspectorRuntimeContext {
  cells: NotebookCell[];
  modelId: string;
  runCellId: string;
  matrixColumnSums: MatrixColumnSumBindings;
}

function resolveInspectorRuntimeContext(args: {
  notebookCells?: NotebookCell[];
  modelSource?: InspectorModelSource | null;
  sourceRunCellId?: string | null;
  editor: EditorState;
}): InspectorRuntimeContext | null {
  if (!args.notebookCells?.length || !args.modelSource) {
    return null;
  }

  const modelId =
    "sourceModelId" in args.modelSource ? args.modelSource.sourceModelId.trim() : "";
  const runCellId = args.sourceRunCellId?.trim() ?? "";
  if (!modelId || !runCellId) {
    return null;
  }

  const equationSources = args.editor.equations
    .filter((equation): equation is EquationRow => !isRowComment(equation))
    .map((equation) => equation.expression.trim())
    .filter(Boolean);

  const implicitSources = collectImplicitMatrixAccumulationEquations({
    cells: args.notebookCells,
    modelId,
    runCellId,
    existingEquationNames: new Set(
      args.editor.equations
        .filter((equation): equation is EquationRow => !isRowComment(equation))
        .map((equation) => equationOutputVariable(equation.name) ?? equation.name.trim())
    )
  }).map((equation) => equation.expression);

  const matrixColumnSums = resolveMatrixColumnSumBindings({
    cells: args.notebookCells,
    modelId,
    runCellId,
    equationSources: [...equationSources, ...implicitSources]
  });

  return {
    cells: args.notebookCells,
    modelId,
    runCellId,
    matrixColumnSums
  };
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

  if (args.kind === "matrix-column-integral") {
    return `This integrated column level aggregates ${pluralize(args.affectedByCount, "linked flow term")} from the account-transactions matrix.`;
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
    case "matrix-column-integral":
      return "Matrix column integral";
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
