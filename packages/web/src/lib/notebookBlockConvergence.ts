import type { ModelDefinition, SimulationOptions } from "@sfcr/core";

import { buildRuntimeConfig, type EditorState } from "./editorModel";
import { buildVariableDescriptions } from "./variableDescriptions";
import { buildVariableUnitMetadata } from "./units";
import { findPreferredRunForModelKey } from "./variableCatalog";
import {
  buildEditorStateForInspectorModelSource,
  type VariableInspectRequest
} from "./variableInspect";
import { buildEditorStateForNotebookModel } from "../notebook/modelSections";
import { resolveRunCellOptions } from "../notebook/useNotebookRunner";
import type { InitialValueListItem, NotebookDocument, RunCell } from "../notebook/types";

export function buildNotebookBlockConvergenceRuntime(
  document: NotebookDocument,
  args: {
    modelId: string;
    runCell?: RunCell | null;
    initialValuesOverride?: InitialValueListItem[];
    periodsMin?: number;
  }
): { model: ModelDefinition; options: SimulationOptions } | null {
  const runCell =
    args.runCell ?? findPreferredRunForModelKey(document, `model:${args.modelId}`);
  const editorBase = buildEditorStateForNotebookModel(document, {
    modelId: args.modelId,
    periods: runCell?.periods
  });
  if (!editorBase) {
    return null;
  }

  const editor: EditorState = args.initialValuesOverride
    ? { ...editorBase, initialValues: args.initialValuesOverride }
    : editorBase;

  const runtime = buildRuntimeConfig(editor, {
    notebookCells: document.cells,
    modelId: args.modelId,
    runCellId: runCell?.id
  });

  const options = runCell ? resolveRunCellOptions(runtime.options, runCell) : runtime.options;
  const periods = Math.max(options.periods, args.periodsMin ?? 1);

  return {
    model: runtime.model,
    options: { ...options, periods }
  };
}

export function buildNotebookModelVariableInspectRequest(
  document: NotebookDocument,
  args: {
    modelId: string;
    selectedVariable: string;
    currentValues: Record<string, number | undefined>;
  }
): VariableInspectRequest | null {
  const modelSource = { sourceModelId: args.modelId };
  const editor = buildEditorStateForInspectorModelSource(document, modelSource);
  if (!editor) {
    return null;
  }

  return {
    currentValues: args.currentValues,
    editor,
    modelSource,
    sourceRunCellId: findPreferredRunForModelKey(document, `model:${args.modelId}`)?.id ?? null,
    selectedVariable: args.selectedVariable,
    variableDescriptions: buildVariableDescriptions({
      equations: editor.equations,
      externals: editor.externals
    }),
    variableUnitMetadata: buildVariableUnitMetadata({
      equations: editor.equations,
      externals: editor.externals
    })
  };
}
