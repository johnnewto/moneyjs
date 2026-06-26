import type { ExternalDef, EquationRole, ScenarioDefinition, SolverMethod } from "@sfcr/core";
import type { UnitMeta } from "../../lib/unitMeta";
import type { NotebookPatch } from "../notebookPatch";

export function requireString(args: Record<string, unknown> | undefined, key: string): string {
  const value = args?.[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Tool argument '${key}' must be a non-empty string.`);
  }
  return value.trim();
}

export function requireRunId(args: Record<string, unknown> | undefined): string {
  for (const key of ["runId", "sourceRunCellId", "runCellId", "sourceRunId", "resultRunId", "cellId", "id", "run"]) {
    const value = optionalString(args, key);
    if (value) {
      return value;
    }
  }

  throw new Error("Tool argument 'runId' must be a non-empty string.");
}

export function optionalString(args: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = args?.[key];
  if (value == null || value === "") {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(`Tool argument '${key}' must be a string.`);
  }
  return value.trim() || undefined;
}

function firstOptionalString(
  args: Record<string, unknown> | undefined,
  keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = optionalString(args, key);
    if (value != null) {
      return value;
    }
  }
  return undefined;
}

export function requireAddEquationArgs(
  args: Record<string, unknown> | undefined
): { expression: string; name: string } {
  const parsedEquation = parseEquationArgument(args);
  const name = firstOptionalString(args, ["name", "variable", "lhs"]) ?? parsedEquation?.name;
  const expression =
    firstOptionalString(args, ["expression", "rhs", "formula", "valueText"]) ?? parsedEquation?.expression;

  if (!name) {
    throw new Error("Tool argument 'name' must be a non-empty string.");
  }
  if (!expression) {
    throw new Error("Tool argument 'expression' must be a non-empty string.");
  }

  return { expression, name };
}

export function requireUpdateEquationArgs(
  args: Record<string, unknown> | undefined
): { expression?: string; variable: string } {
  const parsedEquation = parseEquationArgument(args);
  const variable = firstOptionalString(args, ["variable", "name", "lhs"]) ?? parsedEquation?.name;
  const expression =
    firstOptionalString(args, ["expression", "rhs", "formula", "valueText"]) ?? parsedEquation?.expression;

  if (!variable) {
    throw new Error("Tool argument 'variable' must be a non-empty string.");
  }

  return { expression, variable };
}

function parseEquationArgument(
  args: Record<string, unknown> | undefined
): { expression: string; name: string } | null {
  const equationText = firstOptionalString(args, ["equation", "equationText"]);
  if (!equationText) {
    return null;
  }
  const separatorIndex = equationText.indexOf("=");
  if (separatorIndex <= 0 || separatorIndex >= equationText.length - 1) {
    throw new Error("Tool argument 'equation' must use the form 'name = expression'.");
  }
  const name = equationText.slice(0, separatorIndex).trim();
  const expression = equationText.slice(separatorIndex + 1).trim();
  if (!name || !expression) {
    throw new Error("Tool argument 'equation' must use the form 'name = expression'.");
  }
  return { expression, name };
}

export function requireInteger(args: Record<string, unknown> | undefined, key: string): number {
  const value = optionalInteger(args, key);
  if (value == null) {
    throw new Error(`Tool argument '${key}' must be an integer.`);
  }
  return value;
}

export function optionalInteger(args: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = args?.[key];
  if (value == null || value === "") {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`Tool argument '${key}' must be an integer.`);
  }
  return value;
}

export function requireStringArray(args: Record<string, unknown> | undefined, key: string): string[] {
  const value = args?.[key];
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`Tool argument '${key}' must be a non-empty string array.`);
  }

  return value.map((entry, index) => {
    if (typeof entry !== "string" || entry.trim() === "") {
      throw new Error(`Tool argument '${key}' item ${index + 1} must be a non-empty string.`);
    }
    return entry.trim();
  });
}

export function requireStringArrayAllowEmpty(args: Record<string, unknown> | undefined, key: string): string[] {
  const value = args?.[key];
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`Tool argument '${key}' must be a non-empty string array.`);
  }
  return value.map((entry, index) => {
    if (typeof entry !== "string") {
      throw new Error(`Tool argument '${key}' item ${index + 1} must be a string.`);
    }
    return entry;
  });
}

export function optionalStringArrayAllowEmpty(
  args: Record<string, unknown> | undefined,
  key: string
): string[] | undefined {
  const value = args?.[key];
  if (value == null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error(`Tool argument '${key}' must be a string array.`);
  }
  return value.map((entry, index) => {
    if (typeof entry !== "string") {
      throw new Error(`Tool argument '${key}' item ${index + 1} must be a string.`);
    }
    return entry;
  });
}

export function requireStringOrNumber(
  args: Record<string, unknown> | undefined,
  key: string
): string | number {
  const value = args?.[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    return value.trim();
  }
  throw new Error(`Tool argument '${key}' must be a finite number or non-empty string.`);
}

export function optionalStringOrNumber(
  args: Record<string, unknown> | undefined,
  key: string
): string | number | undefined {
  const value = args?.[key];
  if (value == null || value === "") {
    return undefined;
  }
  return requireStringOrNumber(args, key);
}

export function optionalBoolean(args: Record<string, unknown> | undefined, key: string): boolean | undefined {
  const value = args?.[key];
  if (value == null || value === "") {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new Error(`Tool argument '${key}' must be a boolean.`);
  }
  return value;
}

export function optionalEquationRole(args: Record<string, unknown> | undefined, key: string): EquationRole | undefined {
  const value = optionalString(args, key);
  if (value == null) {
    return undefined;
  }
  if (!(["accumulation", "identity", "target", "definition", "behavioral"] as const).includes(value as EquationRole)) {
    throw new Error(`Tool argument '${key}' must be a valid equation role.`);
  }
  return value as EquationRole;
}

export function optionalExternalKind(args: Record<string, unknown> | undefined, key: string): ExternalDef["kind"] | undefined {
  const value = optionalString(args, key);
  if (value == null) {
    return undefined;
  }
  if (value !== "constant" && value !== "series") {
    throw new Error(`Tool argument '${key}' must be constant or series.`);
  }
  return value;
}

export function optionalSolverMethod(args: Record<string, unknown> | undefined, key: string): SolverMethod | undefined {
  const value = optionalString(args, key);
  if (value == null) {
    return undefined;
  }
  if (value !== "GAUSS_SEIDEL" && value !== "BROYDEN" && value !== "NEWTON") {
    throw new Error(`Tool argument '${key}' must be GAUSS_SEIDEL, BROYDEN, or NEWTON.`);
  }
  return value;
}

export function optionalIntegerPair(
  args: Record<string, unknown> | undefined,
  key: string
): [number, number] | undefined {
  const value = args?.[key];
  if (value == null) {
    return undefined;
  }
  if (!Array.isArray(value) || value.length !== 2 || !value.every((entry) => typeof entry === "number" && Number.isInteger(entry))) {
    throw new Error(`Tool argument '${key}' must be a two-item integer array.`);
  }
  const start = value[0] as number;
  const end = value[1] as number;
  if (end < start) {
    throw new Error(`Tool argument '${key}' must have end greater than or equal to start.`);
  }
  return [start, end];
}

export function optionalChartAxisMode(
  args: Record<string, unknown> | undefined,
  key: string
): "shared" | "separate" | undefined {
  const value = optionalString(args, key);
  if (value == null) {
    return undefined;
  }
  if (value !== "shared" && value !== "separate") {
    throw new Error(`Tool argument '${key}' must be shared or separate.`);
  }
  return value;
}

export function optionalReferenceTrace(
  args: Record<string, unknown> | undefined,
  key: string
): "none" | "baseline" | "previous-run" | "observed" | undefined {
  const value = optionalString(args, key);
  if (value == null) {
    return undefined;
  }
  if (value !== "none" && value !== "baseline" && value !== "previous-run" && value !== "observed") {
    throw new Error(`Tool argument '${key}' must be none, baseline, previous-run, or observed.`);
  }
  return value;
}

export function optionalShowScenarioShocks(
  args: Record<string, unknown> | undefined,
  key: string
): boolean | "auto" | undefined {
  if (args?.[key] == null) {
    return undefined;
  }

  const value = args[key];
  if (value === "auto") {
    return "auto";
  }
  if (typeof value === "boolean") {
    return value;
  }

  throw new Error(`Tool argument '${key}' must be true, false, or auto.`);
}

export function optionalPlainObject(
  args: Record<string, unknown> | undefined,
  key: string
): Record<string, unknown> | undefined {
  const value = args?.[key];
  if (value == null) {
    return undefined;
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Tool argument '${key}' must be an object.`);
  }
  return value as Record<string, unknown>;
}

export function optionalScenarioDefinition(args: Record<string, unknown> | undefined): ScenarioDefinition | undefined {
  const scenario = args?.scenario;
  const shocks = args?.shocks;
  if (scenario == null && shocks == null) {
    return undefined;
  }
  return requireScenarioDefinition(args);
}

export function requireScenarioDefinition(args: Record<string, unknown> | undefined): ScenarioDefinition {
  const scenarioValue = args?.scenario;
  const scenarioObject = scenarioValue && typeof scenarioValue === "object" && !Array.isArray(scenarioValue)
    ? (scenarioValue as Record<string, unknown>)
    : undefined;
  const shocksValue = args?.shocks ?? scenarioObject?.shocks;
  if (!Array.isArray(shocksValue) || shocksValue.length === 0) {
    throw new Error("Tool arguments must include non-empty scenario shocks.");
  }

  return {
    shocks: shocksValue.map((shock, shockIndex) => normalizeShockDefinition(shock, shockIndex))
  };
}

function normalizeShockDefinition(shock: unknown, shockIndex: number): ScenarioDefinition["shocks"][number] {
  if (!shock || typeof shock !== "object" || Array.isArray(shock)) {
    throw new Error(`Scenario shock ${shockIndex + 1} must be an object.`);
  }
  const record = shock as Record<string, unknown>;
  const rangeInclusive = record.rangeInclusive;
  const start = Array.isArray(rangeInclusive) ? rangeInclusive[0] : record.startPeriodInclusive;
  const end = Array.isArray(rangeInclusive) ? rangeInclusive[1] : record.endPeriodInclusive;
  if (typeof start !== "number" || !Number.isInteger(start) || typeof end !== "number" || !Number.isInteger(end)) {
    throw new Error(`Scenario shock ${shockIndex + 1} must define integer start and end periods.`);
  }
  if (end < start) {
    throw new Error(`Scenario shock ${shockIndex + 1} has an invalid range.`);
  }
  const variables = record.variables;
  if (!variables || typeof variables !== "object" || Array.isArray(variables)) {
    throw new Error(`Scenario shock ${shockIndex + 1} must define variables.`);
  }

  return {
    startPeriodInclusive: start,
    endPeriodInclusive: end,
    variables: Object.fromEntries(
      Object.entries(variables).map(([name, variableDef]) => [name, normalizeShockVariableDefinition(variableDef, name, shockIndex)])
    )
  };
}

function normalizeShockVariableDefinition(
  variableDef: unknown,
  name: string,
  shockIndex: number
): ScenarioDefinition["shocks"][number]["variables"][string] {
  if (!variableDef || typeof variableDef !== "object" || Array.isArray(variableDef)) {
    throw new Error(`Scenario shock ${shockIndex + 1} variable '${name}' must be an object.`);
  }
  const record = variableDef as Record<string, unknown>;
  const inferredKind = record.kind ?? (Array.isArray(record.values) ? "series" : record.value != null ? "constant" : undefined);
  if (inferredKind !== "constant" && inferredKind !== "series") {
    throw new Error(`Scenario shock ${shockIndex + 1} variable '${name}' must use kind constant or series.`);
  }
  if (inferredKind === "constant") {
    const value = typeof record.value === "number" ? record.value : typeof record.value === "string" ? Number(record.value) : NaN;
    if (!Number.isFinite(value)) {
      throw new Error(`Scenario shock ${shockIndex + 1} variable '${name}' must have a finite constant value.`);
    }
    return { kind: "constant", value };
  }

  if (!Array.isArray(record.values) || record.values.length === 0 || !record.values.every((entry) => typeof entry === "number" && Number.isFinite(entry))) {
    throw new Error(`Scenario shock ${shockIndex + 1} variable '${name}' must have a finite numeric values array.`);
  }
  return { kind: "series", values: record.values as number[] };
}

export function optionalStockFlow(args: Record<string, unknown> | undefined, key: string): UnitMeta["stockFlow"] | undefined {
  const value = optionalString(args, key);
  if (value == null) {
    return undefined;
  }
  if (value !== "stock" && value !== "flow" && value !== "aux") {
    throw new Error(`Tool argument '${key}' must be stock, flow, or aux.`);
  }
  return value;
}

export function optionalUnitMeta(args: Record<string, unknown> | undefined, key: string): UnitMeta | undefined {
  const value = args?.[key];
  if (value == null) {
    return undefined;
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Tool argument '${key}' must be an object.`);
  }
  return value as UnitMeta;
}

export function requirePatch(args: Record<string, unknown> | undefined): NotebookPatch {
  const value = args?.patch;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Tool argument 'patch' must be a notebook patch object.");
  }

  const operations = (value as { operations?: unknown }).operations;
  if (!Array.isArray(operations)) {
    throw new Error("Tool argument 'patch.operations' must be an array.");
  }

  return value as NotebookPatch;
}


