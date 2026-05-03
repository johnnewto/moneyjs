import { analyzeParsedEquation, parseEquation, type EquationRole } from "@sfcr/core";

import type {
  EditorState,
  EquationRow,
  ExternalRow,
  InitialValueRow
} from "./editorModel";
import type { NotebookCell } from "../notebook/types";
import {
  buildDerivedAccountingTermsFromCells
} from "../notebook/dependencyRows";
import type { VariableDescriptions } from "./variableDescriptions";
import type { VariableUnitMetadata } from "./unitMeta";
import { explainEquationExpression } from "./equationExplanation";
import { getVariableUnitText } from "./units";

export interface VariableInspectorData {
  name: string;
  description?: string;
  unitLabel?: string | null;
  parameterNames: string[];
  kind: "equation" | "external" | "initial-only" | "unknown";
  roleLabel: string;
  roleSummary: string;
  equationRoleLabel: string | null;
  equationRoleSourceLabel: string | null;
  currentValue?: number;
  initialValue?: number;
  definingEquation: EquationRow | null;
  generatedEquationExplanation: string | null;
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
  selectedVariable: string | null;
  variableDescriptions: VariableDescriptions;
  variableUnitMetadata: VariableUnitMetadata;
}): VariableInspectorData | null {
  const selectedVariable = args.selectedVariable?.trim() ?? "";
  if (!selectedVariable) {
    return null;
  }

  const equationAnalysis = buildEquationAnalysis(args.editor.equations);
  const definingEquation =
    args.editor.equations.find((equation) => equation.name.trim() === selectedVariable) ?? null;
  const externalDefinition =
    args.editor.externals.find((external) => external.name.trim() === selectedVariable) ?? null;
  const initialValue = findInitialValue(args.editor.initialValues, selectedVariable);
  const appearsInEquations = args.editor.equations.filter((equation) => {
    if (equation.name.trim() === selectedVariable) {
      return false;
    }
    const analysis = equationAnalysis.get(equation.id);
    return (
      analysis?.currentDependencies.includes(selectedVariable) ||
      analysis?.lagDependencies.includes(selectedVariable)
    );
  });

  const equationInputs = definingEquation
    ? equationAnalysis.get(definingEquation.id) ?? { currentDependencies: [], lagDependencies: [] }
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
    undefined;
  const unitMeta = args.variableUnitMetadata.get(selectedVariable);
  const stockFlow = unitMeta?.stockFlow ?? null;
  const unitLabel = getVariableUnitText(args.variableUnitMetadata, selectedVariable);
  const currentValue = args.currentValues?.[selectedVariable];

  const kind = definingEquation
    ? "equation"
    : externalDefinition
      ? "external"
      : initialValue != null
        ? "initial-only"
        : "unknown";

  const generatedEquationExplanation = definingEquation
    ? buildGeneratedEquationExplanation(definingEquation, args.variableDescriptions)
    : null;
  const equationRoleMeta = definingEquation
    ? buildEquationRoleMeta(definingEquation)
    : { label: null, sourceLabel: null };
  const parameterNames = uniqueSorted(args.editor.externals.map((external) => external.name.trim()));
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
    const output = equation.name.trim();
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
    addEntry(args.definingEquation, "root", [
      [args.selectedVariable, "root"],
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
        addEntry(equation, "input", [[dependency, "input"]]);
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

function findInitialValue(initialValues: InitialValueRow[], variableName: string): number | undefined {
  const row = initialValues.find((initial) => initial.name.trim() === variableName);
  if (!row) {
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
    default:
      return "Unresolved";
  }
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
