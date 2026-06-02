import { derivativeBalanceStockName, type ShockVariableDef } from "@sfcr/core";
import { isRowComment } from "@sfcr/notebook-core";

import type { EquationRow, ExternalRow } from "../lib/editorModel";
import { resolveNearestNotebookContextCell } from "./notebookContext";
import { resolveRunCellModelKey } from "./modelSections";
import type {
  ChartCell,
  EquationsCell,
  ExternalsCell,
  InitialValuesCell,
  MatrixCell,
  ModelCell,
  NotebookCell,
  RunCell,
  SequenceCell,
  SolverCell,
  TableCell
} from "./types";

const IDENTIFIER_PATTERN = /[A-Za-z_][A-Za-z0-9_.^{}]*/g;

export type ModelRenameScope =
  | { kind: "modelId"; modelId: string }
  | { kind: "legacyModelCell"; cellId: string };

export interface VariableReferenceCount {
  cellCount: number;
  referenceCount: number;
}

export function replaceIdentifierInSource(source: string, oldName: string, newName: string): string {
  if (!source || oldName === newName) {
    return source;
  }

  return source.replace(IDENTIFIER_PATTERN, (token) => (token === oldName ? newName : token));
}

export function isModelVariableNameAvailable(
  cells: NotebookCell[],
  scope: ModelRenameScope,
  variable: string,
  options?: { excludeEquationId?: string; excludeExternalId?: string }
): boolean {
  const normalizedVariable = variable.trim();
  if (!normalizedVariable) {
    return false;
  }

  for (const cell of cells) {
    if (!cellMatchesScope(cell, cells, scope)) {
      continue;
    }

    if (cell.type === "equations") {
      if (
        cell.equations.some(
          (equation) =>
            !isRowComment(equation) &&
            equationNameDefinesVariable(equation.name, normalizedVariable) &&
            equation.id !== options?.excludeEquationId
        )
      ) {
        return false;
      }
    }

    if (cell.type === "externals") {
      if (
        cell.externals.some(
          (external) =>
            !isRowComment(external) &&
            external.name.trim() === normalizedVariable &&
            external.id !== options?.excludeExternalId
        )
      ) {
        return false;
      }
    }

    if (cell.type === "model") {
      if (
        cell.editor.equations.some(
          (equation) =>
            !isRowComment(equation) &&
            equationNameDefinesVariable(equation.name, normalizedVariable) &&
            equation.id !== options?.excludeEquationId
        )
      ) {
        return false;
      }
      if (
        cell.editor.externals.some(
          (external) =>
            !isRowComment(external) &&
            external.name.trim() === normalizedVariable &&
            external.id !== options?.excludeExternalId
        )
      ) {
        return false;
      }
    }
  }

  return true;
}

export function countVariableReferences(
  cells: NotebookCell[],
  scope: ModelRenameScope,
  variable: string
): VariableReferenceCount {
  const normalizedVariable = variable.trim();
  if (!normalizedVariable) {
    return { cellCount: 0, referenceCount: 0 };
  }

  let cellCount = 0;
  let referenceCount = 0;

  for (const cell of cells) {
    const cellReferences = countReferencesInCell(cell, cells, scope, normalizedVariable);
    if (cellReferences > 0) {
      cellCount += 1;
      referenceCount += cellReferences;
    }
  }

  return { cellCount, referenceCount };
}

export function renameVariableInNotebook(
  cells: NotebookCell[],
  scope: ModelRenameScope,
  oldName: string,
  newName: string
): NotebookCell[] {
  const normalizedOldName = oldName.trim();
  const normalizedNewName = newName.trim();
  if (!normalizedOldName || !normalizedNewName || normalizedOldName === normalizedNewName) {
    return cells;
  }

  return cells.map((cell) => renameVariableInCell(cell, cells, scope, normalizedOldName, normalizedNewName));
}

export function patchEquationInNotebook(
  cells: NotebookCell[],
  scope: ModelRenameScope,
  equationId: string,
  patch: Pick<EquationRow, "name" | "expression">
): NotebookCell[] {
  return cells.map((cell) => {
    if (cell.type === "equations" && cellMatchesScope(cell, cells, scope)) {
      return {
        ...cell,
        equations: cell.equations.map((equation) =>
          !isRowComment(equation) && equation.id === equationId
            ? {
                ...equation,
                name: patch.name,
                expression: patch.expression
              }
            : equation
        )
      };
    }

    if (cell.type === "model" && scope.kind === "legacyModelCell" && cell.id === scope.cellId) {
      return {
        ...cell,
        editor: {
          ...cell.editor,
          equations: cell.editor.equations.map((equation) =>
            !isRowComment(equation) && equation.id === equationId
              ? {
                  ...equation,
                  name: patch.name,
                  expression: patch.expression
                }
              : equation
          )
        }
      };
    }

    return cell;
  });
}

export function patchExternalInNotebook(
  cells: NotebookCell[],
  scope: ModelRenameScope,
  externalId: string,
  patch: Pick<ExternalRow, "name" | "valueText">
): NotebookCell[] {
  return cells.map((cell) => {
    if (cell.type === "externals" && cellMatchesScope(cell, cells, scope)) {
      return {
        ...cell,
        externals: cell.externals.map((external) =>
          !isRowComment(external) && external.id === externalId
            ? {
                ...external,
                name: patch.name,
                valueText: patch.valueText
              }
            : external
        )
      };
    }

    if (cell.type === "model" && scope.kind === "legacyModelCell" && cell.id === scope.cellId) {
      return {
        ...cell,
        editor: {
          ...cell.editor,
          externals: cell.editor.externals.map((external) =>
            !isRowComment(external) && external.id === externalId
              ? {
                  ...external,
                  name: patch.name,
                  valueText: patch.valueText
                }
              : external
          )
        }
      };
    }

    return cell;
  });
}

function renameVariableInCell(
  cell: NotebookCell,
  cells: NotebookCell[],
  scope: ModelRenameScope,
  oldName: string,
  newName: string
): NotebookCell {
  if (!cellMatchesScope(cell, cells, scope)) {
    return cell;
  }

  switch (cell.type) {
    case "equations":
      return {
        ...cell,
        equations: cell.equations.map((equation) =>
          isRowComment(equation)
            ? equation
            : {
                ...equation,
                name: renameEquationTargetName(equation.name, oldName, newName),
                expression: replaceIdentifierInSource(equation.expression, oldName, newName)
              }
        )
      };
    case "externals":
      return {
        ...cell,
        externals: cell.externals.map((external) =>
          isRowComment(external)
            ? external
            : {
                ...external,
                name: external.name.trim() === oldName ? newName : external.name
              }
        )
      };
    case "initial-values":
      return {
        ...cell,
        initialValues: cell.initialValues.map((row) =>
          isRowComment(row)
            ? row
            : {
                ...row,
                name: row.name.trim() === oldName ? newName : row.name
              }
        )
      };
    case "solver":
      return {
        ...cell,
        options: {
          ...cell.options,
          hiddenLeftVariable:
            cell.options.hiddenLeftVariable.trim() === oldName
              ? newName
              : cell.options.hiddenLeftVariable,
          hiddenRightVariable:
            cell.options.hiddenRightVariable.trim() === oldName
              ? newName
              : cell.options.hiddenRightVariable
        }
      };
    case "model":
      return {
        ...cell,
        editor: {
          ...cell.editor,
          equations: cell.editor.equations.map((equation) =>
            isRowComment(equation)
              ? equation
              : {
                  ...equation,
                  name: renameEquationTargetName(equation.name, oldName, newName),
                  expression: replaceIdentifierInSource(equation.expression, oldName, newName)
                }
          ),
          externals: cell.editor.externals.map((external) =>
            isRowComment(external)
              ? external
              : {
                  ...external,
                  name: external.name.trim() === oldName ? newName : external.name
                }
          ),
          initialValues: cell.editor.initialValues.map((row) =>
            isRowComment(row)
              ? row
              : {
                  ...row,
                  name: row.name.trim() === oldName ? newName : row.name
                }
          ),
          options: {
            ...cell.editor.options,
            hiddenLeftVariable:
              cell.editor.options.hiddenLeftVariable.trim() === oldName
                ? newName
                : cell.editor.options.hiddenLeftVariable,
            hiddenRightVariable:
              cell.editor.options.hiddenRightVariable.trim() === oldName
                ? newName
                : cell.editor.options.hiddenRightVariable
          }
        }
      };
    case "matrix":
      return {
        ...cell,
        rows: cell.rows.map((row) => ({
          ...row,
          values: row.values.map((value) => replaceIdentifierInSource(value, oldName, newName))
        }))
      };
    case "table":
      return {
        ...cell,
        variables: cell.variables.map((name) => (name.trim() === oldName ? newName : name))
      };
    case "chart":
      return {
        ...cell,
        variables: cell.variables.map((name) => (name.trim() === oldName ? newName : name)),
        seriesRanges: renameSeriesRangeKeys(cell.seriesRanges, oldName, newName)
      };
    case "run":
      return {
        ...cell,
        scenario: cell.scenario ? renameScenario(cell.scenario, oldName, newName) : cell.scenario
      };
    case "sequence":
      return renameSequenceCell(cell, oldName, newName);
    case "markdown":
      return {
        ...cell,
        source: replaceIdentifierInSource(cell.source, oldName, newName)
      };
    default:
      return cell;
  }
}

function renameSeriesRangeKeys(
  seriesRanges: ChartCell["seriesRanges"],
  oldName: string,
  newName: string
): ChartCell["seriesRanges"] {
  if (!seriesRanges) {
    return seriesRanges;
  }

  const next: NonNullable<ChartCell["seriesRanges"]> = {};
  for (const [key, value] of Object.entries(seriesRanges)) {
    next[key.trim() === oldName ? newName : key] = value;
  }
  return next;
}

function renameScenario<T extends NonNullable<RunCell["scenario"]>>(
  scenario: T,
  oldName: string,
  newName: string
): T {
  return {
    ...scenario,
    shocks: scenario.shocks.map((shock) => {
      const nextVariables: Record<string, ShockVariableDef> = {};
      for (const [key, value] of Object.entries(shock.variables)) {
        nextVariables[key.trim() === oldName ? newName : key] = value;
      }
      return {
        ...shock,
        variables: nextVariables
      };
    })
  } as T;
}

function renameSequenceCell(cell: SequenceCell, oldName: string, newName: string): SequenceCell {
  if (cell.source.kind !== "matrix" || !cell.source.aliases) {
    return cell;
  }

  const nextAliases: Record<string, string> = {};
  for (const [alias, variable] of Object.entries(cell.source.aliases)) {
    nextAliases[alias] = variable.trim() === oldName ? newName : variable;
  }

  return {
    ...cell,
    source: {
      ...cell.source,
      aliases: nextAliases
    }
  };
}

function countReferencesInCell(
  cell: NotebookCell,
  cells: NotebookCell[],
  scope: ModelRenameScope,
  variable: string
): number {
  if (!cellMatchesScope(cell, cells, scope)) {
    return 0;
  }

  switch (cell.type) {
    case "equations":
      return cell.equations.reduce((total, equation) => {
        if (isRowComment(equation)) {
          return total;
        }
        return (
          total +
          countNameMatch(equation.name, variable) +
          countIdentifierOccurrences(equation.expression, variable)
        );
      }, 0);
    case "externals":
      return cell.externals.reduce(
        (total, external) =>
          isRowComment(external) ? total : total + countNameMatch(external.name, variable),
        0
      );
    case "initial-values":
      return cell.initialValues.reduce(
        (total, row) => (isRowComment(row) ? total : total + countNameMatch(row.name, variable)),
        0
      );
    case "solver":
      return (
        countNameMatch(cell.options.hiddenLeftVariable, variable) +
        countNameMatch(cell.options.hiddenRightVariable, variable)
      );
    case "model":
      return (
        cell.editor.equations.reduce((total, equation) => {
          if (isRowComment(equation)) {
            return total;
          }
          return (
            total +
            countNameMatch(equation.name, variable) +
            countIdentifierOccurrences(equation.expression, variable)
          );
        }, 0) +
        cell.editor.externals.reduce(
          (total, external) =>
            isRowComment(external) ? total : total + countNameMatch(external.name, variable),
          0
        ) +
        cell.editor.initialValues.reduce(
          (total, row) => (isRowComment(row) ? total : total + countNameMatch(row.name, variable)),
          0
        ) +
        countNameMatch(cell.editor.options.hiddenLeftVariable, variable) +
        countNameMatch(cell.editor.options.hiddenRightVariable, variable)
      );
    case "matrix":
      return cell.rows.reduce(
        (total, row) =>
          total + row.values.reduce((rowTotal, value) => rowTotal + countIdentifierOccurrences(value, variable), 0),
        0
      );
    case "table":
      return cell.variables.reduce((total, name) => total + countNameMatch(name, variable), 0);
    case "chart":
      return (
        cell.variables.reduce((total, name) => total + countNameMatch(name, variable), 0) +
        Object.keys(cell.seriesRanges ?? {}).reduce(
          (total, key) => total + countNameMatch(key, variable),
          0
        )
      );
    case "run":
      if (!cell.scenario) {
        return 0;
      }
      return cell.scenario.shocks.reduce(
        (total, shock) => total + Object.keys(shock.variables).reduce((shockTotal, key) => shockTotal + countNameMatch(key, variable), 0),
        0
      );
    case "sequence":
      if (cell.source.kind !== "matrix" || !cell.source.aliases) {
        return 0;
      }
      return Object.values(cell.source.aliases).reduce(
        (total, aliasVariable) => total + countNameMatch(aliasVariable, variable),
        0
      );
    case "markdown":
      return countIdentifierOccurrences(cell.source, variable);
    default:
      return 0;
  }
}

function equationNameDefinesVariable(equationName: string, variable: string): boolean {
  const trimmed = equationName.trim();
  if (trimmed === variable) {
    return true;
  }
  return derivativeBalanceStockName(trimmed) === variable;
}

function renameEquationTargetName(equationName: string, oldName: string, newName: string): string {
  const stockName = derivativeBalanceStockName(equationName);
  if (stockName !== null && stockName === oldName) {
    return `d(${newName})`;
  }
  return equationName.trim() === oldName ? newName : equationName;
}

function countNameMatch(name: string, variable: string): number {
  return equationNameDefinesVariable(name, variable) ? 1 : 0;
}

function countIdentifierOccurrences(source: string, variable: string): number {
  if (!source) {
    return 0;
  }

  let count = 0;
  for (const match of source.matchAll(new RegExp(IDENTIFIER_PATTERN.source, "g"))) {
    if (match[0] === variable) {
      count += 1;
    }
  }
  return count;
}

function cellMatchesScope(cell: NotebookCell, cells: NotebookCell[], scope: ModelRenameScope): boolean {
  if (cell.type === "markdown") {
    const contextCell = resolveNearestNotebookContextCell(cells, cell);
    return contextCell != null && cellMatchesScope(contextCell, cells, scope);
  }

  if (scope.kind === "modelId") {
    return cellMatchesModelId(cell, cells, scope.modelId);
  }

  return cellMatchesLegacyModelCell(cell, cells, scope.cellId);
}

function cellMatchesModelId(cell: NotebookCell, cells: NotebookCell[], modelId: string): boolean {
  switch (cell.type) {
    case "equations":
    case "externals":
    case "initial-values":
    case "solver":
      return cell.modelId === modelId;
    case "run":
      return resolveRunCellModelKey(cells, cell) === `model:${modelId}`;
    case "matrix":
    case "table":
    case "chart":
      return runCellMatchesModelId(cells, cell.sourceRunCellId, modelId);
    case "sequence":
      if (cell.source.kind === "dependency") {
        return (cell.source.modelId ?? cell.source.sourceModelId) === modelId;
      }
      if (cell.source.kind === "matrix") {
        return runCellMatchesModelId(cells, cell.source.sourceRunCellId, modelId);
      }
      return false;
    default:
      return false;
  }
}

function cellMatchesLegacyModelCell(cell: NotebookCell, cells: NotebookCell[], cellId: string): boolean {
  if (cell.type === "model") {
    return cell.id === cellId;
  }

  if (cell.type === "run") {
    return cell.sourceModelCellId === cellId;
  }

  if (cell.type === "matrix" || cell.type === "table" || cell.type === "chart") {
    const run = cells.find((entry): entry is RunCell => entry.type === "run" && entry.id === cell.sourceRunCellId);
    return run?.sourceModelCellId === cellId;
  }

  if (cell.type === "sequence" && cell.source.kind === "dependency") {
    return cell.source.sourceModelCellId === cellId;
  }

  if (cell.type === "sequence" && cell.source.kind === "matrix") {
    const sourceRunCellId = cell.source.sourceRunCellId;
    if (!sourceRunCellId) {
      return false;
    }
    const run = cells.find((entry): entry is RunCell => entry.type === "run" && entry.id === sourceRunCellId);
    return run?.sourceModelCellId === cellId;
  }

  return false;
}

function runCellMatchesModelId(
  cells: NotebookCell[],
  sourceRunCellId: string | undefined,
  modelId: string
): boolean {
  if (!sourceRunCellId) {
    return false;
  }

  const run = cells.find((entry): entry is RunCell => entry.type === "run" && entry.id === sourceRunCellId);
  return run ? resolveRunCellModelKey(cells, run) === `model:${modelId}` : false;
}
