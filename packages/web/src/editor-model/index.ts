import {
  derivativeBalanceStockName,
  normalizeDerivativeBalanceTarget,
  parseEquation,
  type EquationRole,
  type ExternalDef,
  type ModelDefinition,
  type ScenarioDefinition,
  type ShockVariableDef,
  type SimulationOptions,
  type SolverMethod
} from "@sfcr/core";
import {
  createNotebookDiagnostic,
  equationRowsOnly,
  externalRowsOnly,
  initialValueRowsOnly,
  isInitialValueEnabled,
  isRowComment,
  type EquationListItem,
  type ExternalListItem,
  type InitialValueListItem,
  type NotebookDiagnosticDomain
} from "@sfcr/notebook-core";
import type { NotebookCell } from "../notebook/types";
import { resolveMatrixColumnSumBindingBundle } from "../notebook/matrixColumnSumRuntime";
import { stringifyJsonWithCompactLeaves } from "../lib/jsonFormat";
import type { UnitMeta } from "../lib/unitMeta";
import { buildVariableUnitMetadata, diagnoseEquationUnits } from "../lib/units";

export type {
  EquationListItem,
  ExternalListItem,
  InitialValueListItem,
  RowComment
} from "@sfcr/notebook-core";

export interface EquationRow {
  id: string;
  name: string;
  desc?: string;
  expression: string;
  role?: EquationRole;
  unitMeta?: UnitMeta;
}
export interface ExternalRow {
  id: string;
  domain?: NotebookDiagnosticDomain;
  name: string;
  desc?: string;
  kind: ExternalDef["kind"];
  valueText: string;
  unitMeta?: UnitMeta;
}

export interface InitialValueRow {
  id: string;
  name: string;
  desc?: string;
  valueText: string;
  enabled?: boolean;
}

export interface ShockVariableRow {
  id: string;
  name: string;
  kind: ShockVariableDef["kind"];
  valueText: string;
}

export interface ShockRow {
  id: string;
  startPeriodInclusive: number;
  endPeriodInclusive: number;
  variables: ShockVariableRow[];
}

export interface EditorScenario {
  shocks: ShockRow[];
}

export interface EditorOptions {
  periods: number;
  solverMethod: SolverMethod;
  toleranceText: string;
  maxIterations: number;
  defaultInitialValueText: string;
  hiddenLeftVariable: string;
  hiddenRightVariable: string;
  hiddenToleranceText: string;
  relativeHiddenTolerance: boolean;
}

export interface EditorState {
  equations: EquationListItem[];
  externals: ExternalListItem[];
  initialValues: InitialValueListItem[];
  options: EditorOptions;
  scenario: EditorScenario;
}

export interface ValidationIssue {
  path: string;
  message: string;
  severity?: "error" | "warning";
}

export interface BuildDiagnosticResult {
  issues: ValidationIssue[];
  modelError: string | null;
}

export function editorStateFromModel(
  model: ModelDefinition,
  options: SimulationOptions,
  scenario?: ScenarioDefinition | null
): EditorState {
  return {
    equations: model.equations.map((equation, index) => ({
      id: `eq-${index}-${equation.name}`,
      name: equation.name,
      desc: "",
      expression: equation.expression,
      role: equation.role
    })),
    externals: Object.entries(model.externals).map(([name, external], index) => ({
      id: `ext-${index}-${name}`,
      name,
      desc: "",
      kind: external.kind,
      valueText:
        external.kind === "constant"
          ? String(external.value)
          : external.values.join(", ")
    })),
    initialValues: Object.entries(model.initialValues).map(([name, value], index) => ({
      id: `init-${index}-${name}`,
      name,
      valueText: String(value)
    })),
    options: {
      periods: options.periods,
      solverMethod: options.solverMethod,
      toleranceText: String(options.tolerance),
      maxIterations: options.maxIterations,
      defaultInitialValueText: String(options.defaultInitialValue ?? 1e-15),
      hiddenLeftVariable: options.hiddenEquation?.leftVariable ?? "",
      hiddenRightVariable: options.hiddenEquation?.rightVariable ?? "",
      hiddenToleranceText: String(options.hiddenEquation?.tolerance ?? 1e-5),
      relativeHiddenTolerance: options.hiddenEquation?.relative ?? false
    },
    scenario: {
      shocks:
        scenario?.shocks.map((shock, index) => ({
          id: `shock-${index}`,
          startPeriodInclusive: shock.startPeriodInclusive,
          endPeriodInclusive: shock.endPeriodInclusive,
          variables: Object.entries(shock.variables).map(([name, value], variableIndex) => ({
            id: `shock-${index}-var-${variableIndex}-${name}`,
            name,
            kind: value.kind,
            valueText:
              value.kind === "constant" ? String(value.value) : value.values.join(", ")
          }))
        })) ?? []
    }
  };
}

export interface BuildRuntimeConfigOptions {
  notebookCells?: NotebookCell[];
  modelId?: string;
  runCellId?: string;
}

export function buildRuntimeConfig(
  editor: EditorState,
  runtimeOptions?: BuildRuntimeConfigOptions
): {
  model: ModelDefinition;
  options: SimulationOptions;
  scenario: ScenarioDefinition | null;
} {
  const equations = equationRowsOnly(editor.equations)
    .filter((equation) => equation.name.trim() !== "" && equation.expression.trim() !== "")
    .map((equation) => {
      const { name, source } = normalizeDerivativeBalanceTarget(
        equation.name.trim(),
        equation.expression.trim()
      );
      return {
        name,
        expression: source,
        ...(equation.role ? { role: equation.role } : {})
      };
    });

  const externals = Object.fromEntries(
    externalRowsOnly(editor.externals)
      .filter((external) => external.name.trim() !== "" && external.valueText.trim() !== "")
      .map((external) => [external.name.trim(), parseExternal(external.kind, external.valueText)])
  );

  const initialValues = Object.fromEntries(
    initialValueRowsOnly(editor.initialValues)
      .filter(
        (initial) =>
          isInitialValueEnabled(initial) &&
          initial.name.trim() !== "" &&
          initial.valueText.trim() !== ""
      )
      .map((initial) => [initial.name.trim(), parseNumber(initial.valueText)])
  );

  const matrixColumnSumBundle =
    runtimeOptions?.notebookCells &&
    runtimeOptions.modelId &&
    runtimeOptions.runCellId
      ? resolveMatrixColumnSumBindingBundle({
          cells: runtimeOptions.notebookCells,
          modelId: runtimeOptions.modelId,
          runCellId: runtimeOptions.runCellId,
          equationSources: equations.map((equation) => equation.expression)
        })
      : undefined;

  const model: ModelDefinition = {
    equations,
    externals,
    initialValues,
    ...(matrixColumnSumBundle && Object.keys(matrixColumnSumBundle.bindings).length > 0
      ? {
          matrixColumnSums: matrixColumnSumBundle.bindings,
          matrixColumnSumLocations: matrixColumnSumBundle.locations
        }
      : {})
  };

  const hiddenLeft = editor.options.hiddenLeftVariable.trim();
  const hiddenRight = editor.options.hiddenRightVariable.trim();

  const options: SimulationOptions = {
    periods: editor.options.periods,
    solverMethod: editor.options.solverMethod,
    tolerance: parseNumber(editor.options.toleranceText),
    maxIterations: editor.options.maxIterations,
    defaultInitialValue: parseNumber(editor.options.defaultInitialValueText),
    hiddenEquation:
      hiddenLeft && hiddenRight
        ? {
            leftVariable: hiddenLeft,
            rightVariable: hiddenRight,
            tolerance: parseNumber(editor.options.hiddenToleranceText),
            relative: editor.options.relativeHiddenTolerance
          }
        : undefined
  };

  const shocks = editor.scenario.shocks
    .map((shock) => ({
      startPeriodInclusive: shock.startPeriodInclusive,
      endPeriodInclusive: shock.endPeriodInclusive,
      variables: Object.fromEntries(
        shock.variables
          .filter((variable) => variable.name.trim() !== "" && variable.valueText.trim() !== "")
          .map((variable) => [
            variable.name.trim(),
            parseShockVariable(variable.kind, variable.valueText)
          ])
      )
    }))
    .filter((shock) => Object.keys(shock.variables).length > 0);

  return {
    model,
    options,
    scenario: shocks.length > 0 ? { shocks } : null
  };
}

export interface RuntimeDocument {
  model: ModelDefinition;
  options: SimulationOptions;
  scenario: ScenarioDefinition | null;
}

export function runtimeDocumentFromEditor(editor: EditorState): RuntimeDocument {
  return buildRuntimeConfig(editor);
}

export function editorStateFromRuntimeDocument(document: RuntimeDocument): EditorState {
  return editorStateFromModel(document.model, document.options, document.scenario);
}

export function runtimeDocumentToJson(editor: EditorState): string {
  return stringifyJsonWithCompactLeaves(runtimeDocumentFromEditor(editor));
}

export function editorStateFromJson(source: string): EditorState {
  const parsed = JSON.parse(source) as Partial<RuntimeDocument>;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("JSON document must be an object");
  }
  if (!parsed.model || !parsed.options) {
    throw new Error("JSON document must contain model and options");
  }
  return editorStateFromRuntimeDocument({
    model: parsed.model,
    options: parsed.options,
    scenario: parsed.scenario ?? null
  });
}

export function validateEditorState(editor: EditorState): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const equationNames = new Set<string>();
  const effectiveStockByRow = new Map<string, number>();
  const externalNames = new Set<string>();
  const initialNames = new Set<string>();

  editor.equations.forEach((equation, index) => {
    if (isRowComment(equation)) {
      return;
    }
    const name = equation.name.trim();
    const expression = equation.expression.trim();
    if (!name) {
      issues.push({ path: `equations.${index}.name`, message: "Equation name is required." });
    } else if (equationNames.has(name)) {
      issues.push({ path: `equations.${index}.name`, message: "Equation name must be unique." });
    } else {
      equationNames.add(name);
      const effectiveName = derivativeBalanceStockName(name) ?? name;
      const prior = effectiveStockByRow.get(effectiveName);
      if (prior !== undefined) {
        issues.push({
          path: `equations.${index}.name`,
          message: `Stock '${effectiveName}' is already defined by another equation (row ${prior + 1}).`
        });
      } else {
        effectiveStockByRow.set(effectiveName, index);
      }
    }

    if (!expression) {
      issues.push({
        path: `equations.${index}.expression`,
        message: "Equation expression is required."
      });
    }
  });

  editor.externals.forEach((external, index) => {
    if (isRowComment(external)) {
      return;
    }
    const name = external.name.trim();
    if (!name) {
      issues.push({ path: `externals.${index}.name`, message: "External name is required." });
    } else if (externalNames.has(name)) {
      issues.push({ path: `externals.${index}.name`, message: "External name must be unique." });
    } else {
      externalNames.add(name);
    }

    if (!external.valueText.trim()) {
      issues.push({
        path: `externals.${index}.valueText`,
        message: "External value is required."
      });
    } else if (!isValidNumericInput(external.kind, external.valueText)) {
      issues.push({
        path: `externals.${index}.valueText`,
        message: external.kind === "constant" ? "Enter a valid number." : "Enter valid comma-separated numbers."
      });
    }
  });

  editor.initialValues.forEach((initial, index) => {
    if (isRowComment(initial) || !isInitialValueEnabled(initial)) {
      return;
    }
    const name = initial.name.trim();
    if (!name) {
      issues.push({ path: `initialValues.${index}.name`, message: "Initial variable is required." });
    } else if (initialNames.has(name)) {
      issues.push({
        path: `initialValues.${index}.name`,
        message: "Initial variable must be unique."
      });
    } else {
      initialNames.add(name);
    }

    if (!initial.valueText.trim()) {
      issues.push({
        path: `initialValues.${index}.valueText`,
        message: "Initial value is required."
      });
    } else if (!isValidNumber(initial.valueText)) {
      issues.push({
        path: `initialValues.${index}.valueText`,
        message: "Enter a valid number."
      });
    }
  });

  if (editor.options.periods < 2) {
    issues.push({ path: "options.periods", message: "Periods must be at least 2." });
  }
  if (editor.options.maxIterations < 1) {
    issues.push({ path: "options.maxIterations", message: "Max iterations must be positive." });
  }
  if (!isValidNumber(editor.options.toleranceText) || Number(editor.options.toleranceText) <= 0) {
    issues.push({ path: "options.toleranceText", message: "Tolerance must be a positive number." });
  }
  if (
    !isValidNumber(editor.options.defaultInitialValueText)
  ) {
    issues.push({
      path: "options.defaultInitialValueText",
      message: "Default initial value must be numeric."
    });
  }

  const hiddenLeft = editor.options.hiddenLeftVariable.trim();
  const hiddenRight = editor.options.hiddenRightVariable.trim();
  if (hiddenLeft || hiddenRight) {
    if (!hiddenLeft || !hiddenRight) {
      issues.push({
        path: "options.hiddenEquation",
        message: "Hidden equation requires both left and right variables."
      });
    }
    if (
      !isValidNumber(editor.options.hiddenToleranceText) ||
      Number(editor.options.hiddenToleranceText) <= 0
    ) {
      issues.push({
        path: "options.hiddenToleranceText",
        message: "Hidden tolerance must be a positive number."
      });
    }
  }

  editor.scenario.shocks.forEach((shock, shockIndex) => {
    if (shock.startPeriodInclusive < 1) {
      issues.push({
        path: `scenario.shocks.${shockIndex}.startPeriodInclusive`,
        message: "Shock start must be at least 1."
      });
    }
    if (shock.endPeriodInclusive < shock.startPeriodInclusive) {
      issues.push({
        path: `scenario.shocks.${shockIndex}.endPeriodInclusive`,
        message: "Shock end must be greater than or equal to start."
      });
    }

    const shockNames = new Set<string>();
    shock.variables.forEach((variable, variableIndex) => {
      const name = variable.name.trim();
      if (!name) {
        issues.push({
          path: `scenario.shocks.${shockIndex}.variables.${variableIndex}.name`,
          message: "Shock variable name is required."
        });
      } else if (shockNames.has(name)) {
        issues.push({
          path: `scenario.shocks.${shockIndex}.variables.${variableIndex}.name`,
          message: "Shock variable name must be unique within the shock."
        });
      } else {
        shockNames.add(name);
      }

      if (!variable.valueText.trim()) {
        issues.push({
          path: `scenario.shocks.${shockIndex}.variables.${variableIndex}.valueText`,
          message: "Shock variable value is required."
        });
      } else if (!isValidNumericInput(variable.kind, variable.valueText)) {
        issues.push({
          path: `scenario.shocks.${shockIndex}.variables.${variableIndex}.valueText`,
          message:
            variable.kind === "constant"
              ? "Enter a valid number."
              : "Enter valid comma-separated numbers."
        });
      }
    });
  });

  return classifyValidationIssues(issues, "model");
}

export function diagnoseBuildRuntime(editor: EditorState): BuildDiagnosticResult {
  const issues: ValidationIssue[] = [];
  const variableUnits = buildVariableUnitMetadata({
    equations: editor.equations,
    externals: editor.externals
  });

  editor.equations.forEach((equation, index) => {
    if (isRowComment(equation)) {
      return;
    }
    const name = equation.name.trim();
    const expression = equation.expression.trim();
    if (!name || !expression) {
      return;
    }

    try {
      const parsed = parseEquation(name, expression);
      for (const diagnostic of diagnoseEquationUnits(
        name,
        parsed.sourceExpression,
        variableUnits
      )) {
        issues.push({
          path: `equations.${index}.expression`,
          message: diagnostic.message,
          severity: diagnostic.severity
        });
      }
    } catch (error) {
      issues.push({
        path: `equations.${index}.expression`,
        message:
          error instanceof Error
            ? error.message.includes(expression)
              ? error.message
              : `Equation '${name}': ${error.message} (expression: '${expression}')`
            : `Equation '${name}': Unable to parse equation expression.`
      });
    }
  });

  editor.externals.forEach((external, index) => {
    if (isRowComment(external)) {
      return;
    }
    if (!external.name.trim() || !external.valueText.trim()) {
      return;
    }

    try {
      parseExternal(external.kind, external.valueText);
    } catch (error) {
      issues.push({
        path: `externals.${index}.valueText`,
        message: error instanceof Error ? error.message : "Unable to parse external value."
      });
    }
  });

  editor.initialValues.forEach((initial, index) => {
    if (isRowComment(initial) || !isInitialValueEnabled(initial)) {
      return;
    }
    if (!initial.name.trim() || !initial.valueText.trim()) {
      return;
    }

    try {
      parseNumber(initial.valueText);
    } catch (error) {
      issues.push({
        path: `initialValues.${index}.valueText`,
        message: error instanceof Error ? error.message : "Unable to parse initial value."
      });
    }
  });

  editor.scenario.shocks.forEach((shock, shockIndex) => {
    if (shock.endPeriodInclusive > editor.options.periods) {
      issues.push({
        path: `scenario.shocks.${shockIndex}.endPeriodInclusive`,
        message: "Shock end period must be <= scenario periods."
      });
    }

    shock.variables.forEach((variable, variableIndex) => {
      if (!variable.name.trim() || !variable.valueText.trim()) {
        return;
      }

      try {
        parseShockVariable(variable.kind, variable.valueText);
      } catch (error) {
        issues.push({
          path: `scenario.shocks.${shockIndex}.variables.${variableIndex}.valueText`,
          message: error instanceof Error ? error.message : "Unable to parse shock value."
        });
      }
    });
  });

  const errorIssues = issues.filter((issue) => (issue.severity ?? "error") === "error");

  if (errorIssues.length > 0) {
    const firstIssue = errorIssues[0];
    return {
      issues: classifyValidationIssues(issues, "runtime"),
      modelError: firstIssue ? `Model build error: ${firstIssue.message}` : "Model build error."
    };
  }

  try {
    buildRuntimeConfig(editor);
    return { issues: classifyValidationIssues(issues, "runtime"), modelError: null };
  } catch (error) {
    return {
      issues: [],
      modelError: error instanceof Error ? `Model build error: ${error.message}` : "Model build error."
    };
  }
}

function classifyValidationIssues(
  issues: ValidationIssue[],
  domain: "model" | "runtime"
): ValidationIssue[] {
  return issues.map((issue) => ({
    ...issue,
    ...createNotebookDiagnostic(
      {
        message: issue.message,
        path: issue.path,
        severity: issue.severity
      },
      { domain }
    )
  }));
}

function parseExternal(kind: ExternalDef["kind"], valueText: string): ExternalDef {
  return kind === "constant"
    ? { kind, value: parseNumber(valueText) }
    : { kind, values: parseNumberList(valueText) };
}

function parseShockVariable(kind: ShockVariableDef["kind"], valueText: string): ShockVariableDef {
  return kind === "constant"
    ? { kind, value: parseNumber(valueText) }
    : { kind, values: parseNumberList(valueText) };
}

function parseNumberList(valueText: string): number[] {
  const values = valueText
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value !== "")
    .map((value) => parseNumber(value));

  if (values.length === 0) {
    throw new Error("Expected at least one numeric value");
  }

  return values;
}

function parseNumber(valueText: string): number {
  const value = Number(valueText.trim());
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid number: ${valueText}`);
  }
  return value;
}

function isValidNumericInput(kind: "constant" | "series", valueText: string): boolean {
  return kind === "constant" ? isValidNumber(valueText) : isValidNumberList(valueText);
}

function isValidNumber(valueText: string): boolean {
  return Number.isFinite(Number(valueText.trim()));
}

function isValidNumberList(valueText: string): boolean {
  const parts = valueText
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value !== "");

  return parts.length > 0 && parts.every((value) => isValidNumber(value));
}
