import Ajv2020, { type ErrorObject } from "ajv/dist/2020";
import notebookSchema from "../../public/sfcr-notebook.schema.json";
import type {
  MatrixCell,
  NotebookCell,
  NotebookDocument,
  RunCell,
  SequenceCell
} from "./types";

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateNotebookSchema = ajv.compile(notebookSchema);

export interface NotebookValidationIssue {
  keyword?: string;
  message: string;
  path?: string;
  relatedProperty?: string;
  schemaPath?: string;
  severity: "error" | "warning";
}

export function validateNotebookSchemaObject(value: unknown): NotebookValidationIssue[] {
  if (validateNotebookSchema(value)) {
    return [];
  }

  return filterSchemaErrors(value, validateNotebookSchema.errors ?? []).map(formatSchemaError);
}

const CELL_TYPE_SCHEMA_BRANCH: Record<string, number> = {
  markdown: 0,
  equations: 1,
  solver: 2,
  externals: 3,
  "initial-values": 4,
  run: 5,
  chart: 6,
  table: 7,
  matrix: 8,
  sequence: 9
};

function filterSchemaErrors(value: unknown, errors: ErrorObject[]): ErrorObject[] {
  const filtered = errors.filter((error) => shouldKeepSchemaError(value, error));
  const seen = new Set<string>();
  return filtered.filter((error) => {
    const key = `${error.keyword}:${error.instancePath}:${error.schemaPath}:${JSON.stringify(error.params)}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function shouldKeepSchemaError(value: unknown, error: ErrorObject): boolean {
  const cellPath = getCellPath(error.instancePath);
  if (!cellPath) {
    return true;
  }

  if (error.keyword === "oneOf" && error.schemaPath === "#/oneOf") {
    return false;
  }

  const cell = getJsonPointerValue(value, cellPath);
  const cellType = cell && typeof cell === "object" ? (cell as { type?: unknown }).type : undefined;
  if (typeof cellType !== "string") {
    return true;
  }

  const branchIndex = CELL_TYPE_SCHEMA_BRANCH[cellType];
  if (branchIndex == null) {
    return true;
  }

  const oneOfBranchMatch = error.schemaPath.match(/^#\/oneOf\/(\d+)\//);
  if (!oneOfBranchMatch) {
    return true;
  }

  return Number.parseInt(oneOfBranchMatch[1], 10) === branchIndex;
}

function getCellPath(path: string): string | null {
  const match = path.match(/^(\/cells\/\d+)(?:\/|$)/);
  return match?.[1] ?? null;
}

function getJsonPointerValue(value: unknown, path: string): unknown {
  if (!path || path === "/") {
    return value;
  }

  return path
    .split("/")
    .slice(1)
    .reduce<unknown>((current, segment) => {
      if (current == null || typeof current !== "object") {
        return undefined;
      }

      const key = segment.replace(/~1/g, "/").replace(/~0/g, "~");
      if (Array.isArray(current)) {
        const index = Number.parseInt(key, 10);
        return Number.isNaN(index) ? undefined : current[index];
      }

      return (current as Record<string, unknown>)[key];
    }, value);
}

export function validateNotebookDocument(document: NotebookDocument): NotebookValidationIssue[] {
  const issues: NotebookValidationIssue[] = [];
  const cellIds = new Set<string>();
  const duplicatedCellIds = new Set<string>();
  const runCellIds = new Set<string>();
  const matrixCellIds = new Set<string>();
  const modelCellIds = new Set<string>();
  const sectionModelIds = new Set<string>();

  for (const cell of document.cells) {
    if (cellIds.has(cell.id)) {
      duplicatedCellIds.add(cell.id);
    }
    cellIds.add(cell.id);

    if (cell.type === "run") {
      runCellIds.add(cell.id);
    }
    if (cell.type === "matrix") {
      matrixCellIds.add(cell.id);
    }
    if (cell.type === "model") {
      modelCellIds.add(cell.id);
    }
    if (
      cell.type === "equations" ||
      cell.type === "solver" ||
      cell.type === "externals" ||
      cell.type === "initial-values"
    ) {
      sectionModelIds.add(cell.modelId);
    }
  }

  for (const id of duplicatedCellIds) {
    issues.push({ severity: "error", message: `Duplicate notebook cell id '${id}'.` });
  }

  for (const cell of document.cells) {
    validateCellReferences(cell, { issues, matrixCellIds, modelCellIds, runCellIds, sectionModelIds });
    if (cell.type === "matrix") {
      validateMatrixCell(cell, issues);
    }
  }

  validateModelSectionNames(document.cells, issues);

  return issues;
}

function formatSchemaError(error: ErrorObject): NotebookValidationIssue {
  const path = error.instancePath || "/";
  const message = buildSchemaErrorMessage(error);
  const relatedProperty =
    error.keyword === "required"
      ? (error.params as { missingProperty?: string }).missingProperty
      : error.keyword === "additionalProperties"
        ? (error.params as { additionalProperty?: string }).additionalProperty
        : undefined;
  return {
    keyword: error.keyword,
    path,
    relatedProperty,
    schemaPath: error.schemaPath,
    severity: "error",
    message: `${path}: ${message}`
  };
}

function buildSchemaErrorMessage(error: ErrorObject): string {
  if (error.keyword === "required") {
    const missingProperty = (error.params as { missingProperty?: string }).missingProperty;
    return missingProperty ? `missing required property '${missingProperty}'` : "missing required property";
  }

  if (error.keyword === "additionalProperties") {
    const additionalProperty = (error.params as { additionalProperty?: string }).additionalProperty;
    return additionalProperty
      ? `unexpected property '${additionalProperty}'`
      : "contains an unexpected property";
  }

  if (error.keyword === "const") {
    const allowedValue = (error.params as { allowedValue?: unknown }).allowedValue;
    return `must be ${JSON.stringify(allowedValue)}`;
  }

  if (error.keyword === "enum") {
    const allowedValues = (error.params as { allowedValues?: unknown[] }).allowedValues;
    return allowedValues ? `must be one of ${allowedValues.map(String).join(", ")}` : "must be an allowed value";
  }

  return error.message ?? `failed schema rule '${error.keyword}'`;
}

function validateCellReferences(
  cell: NotebookCell,
  context: {
    issues: NotebookValidationIssue[];
    matrixCellIds: Set<string>;
    modelCellIds: Set<string>;
    runCellIds: Set<string>;
    sectionModelIds: Set<string>;
  }
): void {
  if ("sourceRunCellId" in cell && cell.sourceRunCellId && !context.runCellIds.has(cell.sourceRunCellId)) {
    context.issues.push({
      severity: "error",
      message: `Cell '${cell.id}' references missing run cell '${cell.sourceRunCellId}'.`
    });
  }

  if (cell.type === "run") {
    validateRunCellReferences(cell, context);
  }

  if (cell.type === "sequence") {
    validateSequenceCellReferences(cell, context);
  }
}

function validateRunCellReferences(
  cell: RunCell,
  context: {
    issues: NotebookValidationIssue[];
    modelCellIds: Set<string>;
    runCellIds: Set<string>;
    sectionModelIds: Set<string>;
  }
): void {
  if (cell.baselineRunCellId && !context.runCellIds.has(cell.baselineRunCellId)) {
    context.issues.push({
      severity: "error",
      message: `Run cell '${cell.id}' references missing baseline run '${cell.baselineRunCellId}'.`
    });
  }

  if (cell.sourceModelCellId && !context.modelCellIds.has(cell.sourceModelCellId)) {
    context.issues.push({
      severity: "error",
      message: `Run cell '${cell.id}' references missing model cell '${cell.sourceModelCellId}'.`
    });
  }

  if (cell.sourceModelId && !context.sectionModelIds.has(cell.sourceModelId)) {
    context.issues.push({
      severity: "error",
      message: `Run cell '${cell.id}' references missing model id '${cell.sourceModelId}'.`
    });
  }

  if (!cell.sourceModelCellId && !cell.sourceModelId) {
    context.issues.push({
      severity: "error",
      message: `Run cell '${cell.id}' must reference a source model.`
    });
  }
}

function validateSequenceCellReferences(
  cell: SequenceCell,
  context: {
    issues: NotebookValidationIssue[];
    matrixCellIds: Set<string>;
    modelCellIds: Set<string>;
    sectionModelIds: Set<string>;
  }
): void {
  if (cell.source.kind === "matrix" && !context.matrixCellIds.has(cell.source.matrixCellId)) {
    context.issues.push({
      severity: "error",
      message: `Sequence cell '${cell.id}' references missing matrix '${cell.source.matrixCellId}'.`
    });
  }

  if (cell.source.kind !== "dependency") {
    return;
  }

  if (cell.source.sourceModelCellId && !context.modelCellIds.has(cell.source.sourceModelCellId)) {
    context.issues.push({
      severity: "error",
      message: `Sequence cell '${cell.id}' references missing model cell '${cell.source.sourceModelCellId}'.`
    });
  }

  const modelId = cell.source.modelId ?? cell.source.sourceModelId;
  if (modelId && !context.sectionModelIds.has(modelId)) {
    context.issues.push({
      severity: "error",
      message: `Sequence cell '${cell.id}' references missing model id '${modelId}'.`
    });
  }
}

function validateMatrixCell(cell: MatrixCell, issues: NotebookValidationIssue[]): void {
  cell.rows.forEach((row, index) => {
    if (row.values.length !== cell.columns.length) {
      issues.push({
        severity: "error",
        message: `Matrix cell '${cell.id}' row ${index + 1} has ${row.values.length} values for ${cell.columns.length} columns.`
      });
    }
  });
}

function validateModelSectionNames(
  cells: NotebookCell[],
  issues: NotebookValidationIssue[]
): void {
  const namesByModelAndKind = new Map<string, Map<string, Set<string>>>();

  for (const cell of cells) {
    if (
      cell.type !== "equations" &&
      cell.type !== "externals" &&
      cell.type !== "initial-values" &&
      cell.type !== "model"
    ) {
      continue;
    }

    if (cell.type === "model") {
      validateNamesForKind(cell.id, "equations", cell.editor.equations, namesByModelAndKind, issues);
      validateNamesForKind(cell.id, "externals", cell.editor.externals, namesByModelAndKind, issues);
      validateNamesForKind(
        cell.id,
        "initial-values",
        cell.editor.initialValues,
        namesByModelAndKind,
        issues
      );
      continue;
    }

    const entries =
      cell.type === "equations"
        ? cell.equations
        : cell.type === "externals"
          ? cell.externals
          : cell.initialValues;
    validateNamesForKind(cell.modelId, cell.type, entries, namesByModelAndKind, issues);
  }
}

function validateNamesForKind(
  modelId: string,
  kind: string,
  entries: Array<{ name: string }>,
  namesByModelAndKind: Map<string, Map<string, Set<string>>>,
  issues: NotebookValidationIssue[]
): void {
  const namesByKind = namesByModelAndKind.get(modelId) ?? new Map<string, Set<string>>();
  const seen = namesByKind.get(kind) ?? new Set<string>();

  for (const entry of entries) {
    const name = entry.name.trim();
    if (!name) {
      continue;
    }
    if (seen.has(name)) {
      issues.push({
        severity: "error",
        message: `Model '${modelId}' has duplicate ${kind} variable '${name}'.`
      });
    }
    seen.add(name);
  }

  namesByKind.set(kind, seen);
  namesByModelAndKind.set(modelId, namesByKind);
}
