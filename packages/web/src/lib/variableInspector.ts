import { analyzeParsedEquation, parseEquation, type EquationRole } from "@sfcr/core";

import type {
  EditorState,
  EquationRow,
  ExternalRow,
  InitialValueRow
} from "./editorModel";
import type { VariableDescriptions } from "./variableDescriptions";
import type { VariableUnitMetadata } from "./unitMeta";
import { explainEquationExpression } from "./equationExplanation";
import { getVariableUnitText } from "./units";

export interface VariableInspectorData {
  name: string;
  description?: string;
  unitLabel?: string | null;
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
  appearsInEquations: EquationRow[];
  externalDefinition: ExternalRow | null;
  isStockFlowLabel: string | null;
}

interface EquationAnalysis {
  currentDependencies: string[];
  lagDependencies: string[];
}

export function buildVariableInspectorData(args: {
  currentValues?: Record<string, number | undefined>;
  editor: EditorState;
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

  return {
    name: selectedVariable,
    description,
    unitLabel,
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
    appearsInEquations,
    externalDefinition,
    isStockFlowLabel: stockFlow ? capitalize(stockFlow) : null
  };
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
