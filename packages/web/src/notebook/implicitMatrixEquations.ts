import { equationOutputVariable } from "@sfcr/core";
import {
  functionNameFromSectionTitle,
  isRowComment,
  type EquationListItem,
  type SectionBoundarySignature
} from "@sfcr/notebook-core";

import { findPreferredRunForModelKey } from "../lib/variableCatalog";
import {
  collectImplicitMatrixAccumulationEquations,
  collectMatrixSumRowIntegrationBindings,
  resolveMatrixColumnAccumulationFlowWarning,
  type ImplicitMatrixAccumulationEquation
} from "./matrixColumnSumRuntime";
import type { NotebookCell, NotebookDocument, RunCell } from "./types";

export const IMPLICIT_MATRIX_ACCUMULATION_SECTION_TITLE =
  "Implicit accumulation from account-transactions matrix Sum row";

export const IMPLICIT_MATRIX_INTEGRATION_SECTION_ID = "implicit-matrix-integration";

export interface ImplicitMatrixAccumulationViewEntry extends ImplicitMatrixAccumulationEquation {
  flowWarning: string | null;
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

export function inferMergedMatrixIntegrationBoundary(args: {
  bindings: ReadonlyArray<{ columnRef: string; stockVariable: string }>;
  matrixTitles: readonly string[];
}): SectionBoundarySignature | null {
  if (args.bindings.length === 0) {
    return null;
  }

  const titleSource = args.matrixTitles.map((title) => title.trim()).filter(Boolean).join(" and ");
  const functionName = `${functionNameFromSectionTitle(titleSource || "Matrix")}_matrix_Integration`;

  return {
    functionName,
    inputs: uniqueSorted(args.bindings.map((binding) => binding.columnRef)),
    outputs: uniqueSorted(args.bindings.map((binding) => binding.stockVariable))
  };
}

export function resolvePreferredBaselineRunForModel(
  cells: NotebookCell[],
  modelId: string
): RunCell | null {
  const document = { cells } as NotebookDocument;
  return findPreferredRunForModelKey(document, `model:${modelId.trim()}`);
}

export function resolveImplicitMatrixAccumulationEntries(args: {
  cells: NotebookCell[];
  modelId: string;
  equations: EquationListItem[];
}): {
  boundary: SectionBoundarySignature | null;
  entries: ImplicitMatrixAccumulationViewEntry[];
  preferredRun: RunCell | null;
} {
  const modelId = args.modelId.trim();
  const preferredRun = modelId ? resolvePreferredBaselineRunForModel(args.cells, modelId) : null;
  if (!modelId || !preferredRun) {
    return { boundary: null, preferredRun, entries: [] };
  }

  const { bindings, matrixTitles } = collectMatrixSumRowIntegrationBindings({
    cells: args.cells,
    modelId,
    runCellId: preferredRun.id
  });
  const boundary = inferMergedMatrixIntegrationBoundary({ bindings, matrixTitles });

  const existingEquationNames = new Set<string>();
  for (const equation of args.equations) {
    if (isRowComment(equation)) {
      continue;
    }
    const name = equationOutputVariable(equation.name) ?? equation.name.trim();
    if (name) {
      existingEquationNames.add(name);
    }
  }

  const entries = collectImplicitMatrixAccumulationEquations({
    cells: args.cells,
    modelId,
    runCellId: preferredRun.id,
    existingEquationNames
  }).map((entry) => ({
    ...entry,
    flowWarning: resolveMatrixColumnAccumulationFlowWarning({
      cells: args.cells,
      modelId,
      runCellId: preferredRun.id,
      stockVariable: entry.name
    })
  }));

  return { boundary, preferredRun, entries };
}
