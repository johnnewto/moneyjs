import { equationOutputVariable } from "@sfcr/core";
import { isRowComment, type EquationListItem } from "@sfcr/notebook-core";

import { findPreferredRunForModelKey } from "../lib/variableCatalog";
import {
  collectImplicitMatrixAccumulationEquations,
  resolveMatrixColumnAccumulationFlowWarning,
  type ImplicitMatrixAccumulationEquation
} from "./matrixColumnSumRuntime";
import type { NotebookCell, NotebookDocument, RunCell } from "./types";

export const IMPLICIT_MATRIX_ACCUMULATION_SECTION_TITLE =
  "Implicit accumulation from account-transactions matrix Sum row";

export interface ImplicitMatrixAccumulationViewEntry extends ImplicitMatrixAccumulationEquation {
  flowWarning: string | null;
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
  preferredRun: RunCell | null;
  entries: ImplicitMatrixAccumulationViewEntry[];
} {
  const modelId = args.modelId.trim();
  const preferredRun = modelId ? resolvePreferredBaselineRunForModel(args.cells, modelId) : null;
  if (!modelId || !preferredRun) {
    return { preferredRun, entries: [] };
  }

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

  return { preferredRun, entries };
}
