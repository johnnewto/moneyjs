import type { ExternalDef, EquationRole } from "@sfcr/core";
import type { UnitMeta } from "../../lib/unitMeta";
import type { NotebookPatch } from "../notebookPatch";
import type { NotebookAssistantSnapshot } from "./types";
import { createUniqueRowId, ensureInitialValueNameAvailable, ensureModelVariableNameAvailable, escapeJsonPointerSegment, listEquationDependents, normalizeRequiredName, normalizeVariableUnitMetaPatchValue, resolveEquationRow, resolveEquationsCell, resolveExternalRow, resolveExternalsCell, resolveInitialValueRow, resolveInitialValuesCell, resolveInsertAfterVariableIndex, resolveVariableDescriptionTarget, resolveVariableUnitMetaTarget, slugifyCellId, summarizeNotebookPatchProposal, validateEquationCandidate } from "./shared";

export function createAddEquationPatch(
  snapshot: NotebookAssistantSnapshot,
  args: {
    description?: string;
    expression: string;
    insertAfterVariable?: string;
    modelId: string;
    name: string;
    role?: EquationRole;
    unitMeta?: UnitMeta;
  }
) {
  const equationsCell = resolveEquationsCell(snapshot, args.modelId);
  ensureModelVariableNameAvailable(snapshot, args.modelId, args.name);
  const insertIndex = resolveInsertAfterVariableIndex(equationsCell.equations, args.insertAfterVariable);
  const row = {
    id: createUniqueRowId(equationsCell.equations.map((equation) => equation.id), "eq", args.name),
    name: normalizeRequiredName(args.name, "name"),
    expression: normalizeRequiredName(args.expression, "expression"),
    ...(args.description ? { desc: args.description } : {}),
    ...(args.role ? { role: args.role } : {}),
    ...(args.unitMeta ? { unitMeta: args.unitMeta } : {})
  };

  validateEquationCandidate(snapshot, args.modelId, [...equationsCell.equations, row], row.name);

  const patch: NotebookPatch = {
    description: `Add equation '${row.name}' to model '${args.modelId}'.`,
    operations: [
      {
        op: "add",
        path: `/cells/by-id/${escapeJsonPointerSegment(equationsCell.id)}/equations/${insertIndex}`,
        value: row
      }
    ]
  };

  return summarizeNotebookPatchProposal(snapshot, patch);
}

export function createUpdateEquationPatch(
  snapshot: NotebookAssistantSnapshot,
  args: {
    description?: string;
    expression?: string;
    modelId: string;
    role?: EquationRole;
    unitMeta?: UnitMeta;
    variable: string;
  }
) {
  const equationsCell = resolveEquationsCell(snapshot, args.modelId);
  const { row, rowIndex } = resolveEquationRow(equationsCell, args.variable);
  if (args.description == null && args.expression == null && args.role == null && args.unitMeta == null) {
    throw new Error("Provide at least one equation field to update.");
  }

  const updatedRow = {
    ...row,
    ...(args.description != null ? { desc: args.description } : {}),
    ...(args.expression != null ? { expression: normalizeRequiredName(args.expression, "expression") } : {}),
    ...(args.role != null ? { role: args.role } : {}),
    ...(args.unitMeta != null ? { unitMeta: args.unitMeta } : {})
  };

  const nextEquations = equationsCell.equations.map((equation, index) => (index === rowIndex ? updatedRow : equation));
  validateEquationCandidate(snapshot, args.modelId, nextEquations, updatedRow.name);

  const patch: NotebookPatch = {
    description: `Update equation '${updatedRow.name}'.`,
    operations: [
      {
        op: "replace",
        path: `/cells/by-id/${escapeJsonPointerSegment(equationsCell.id)}/equations/${rowIndex}`,
        value: updatedRow
      }
    ]
  };

  return summarizeNotebookPatchProposal(snapshot, patch);
}

export function createRemoveEquationPatch(
  snapshot: NotebookAssistantSnapshot,
  args: { allowDependents: boolean; modelId: string; variable: string }
) {
  const equationsCell = resolveEquationsCell(snapshot, args.modelId);
  const { row, rowIndex } = resolveEquationRow(equationsCell, args.variable);
  if (!args.allowDependents) {
    const dependents = listEquationDependents(snapshot, args.modelId, row.name);
    if (dependents.length > 0) {
      throw new Error(`Equation '${row.name}' is used by: ${dependents.join(", ")}. Set allowDependents to true to remove it anyway.`);
    }
  }

  const patch: NotebookPatch = {
    description: `Remove equation '${row.name}'.`,
    operations: [
      {
        op: "remove",
        path: `/cells/by-id/${escapeJsonPointerSegment(equationsCell.id)}/equations/${rowIndex}`
      }
    ]
  };

  return summarizeNotebookPatchProposal(snapshot, patch);
}

export function createUpdateVariableDescriptionPatch(
  snapshot: NotebookAssistantSnapshot,
  args: { description: string; modelId: string; variable: string }
) {
  const target = resolveVariableDescriptionTarget(snapshot, args.modelId, args.variable);
  const updatedRow = {
    ...target.row,
    desc: args.description
  };

  const patch: NotebookPatch = {
    description: `Update description for '${updatedRow.name}'.`,
    operations: [
      {
        op: "replace",
        path: `/cells/by-id/${escapeJsonPointerSegment(target.cell.id)}/${target.property}/${target.rowIndex}`,
        value: updatedRow
      }
    ]
  };

  return summarizeNotebookPatchProposal(snapshot, patch);
}

export function createAddExternalPatch(
  snapshot: NotebookAssistantSnapshot,
  args: {
    description?: string;
    insertAfterVariable?: string;
    kind: ExternalDef["kind"];
    modelId: string;
    name: string;
    unitMeta?: UnitMeta;
    value: string | number;
  }
) {
  const externalsCell = resolveExternalsCell(snapshot, args.modelId);
  ensureModelVariableNameAvailable(snapshot, args.modelId, args.name);
  const insertIndex = resolveInsertAfterVariableIndex(externalsCell.externals, args.insertAfterVariable);
  const row = {
    id: createUniqueRowId(externalsCell.externals.map((external) => external.id), "ext", args.name),
    name: normalizeRequiredName(args.name, "name"),
    kind: args.kind,
    valueText: String(args.value),
    ...(args.description ? { desc: args.description } : {}),
    ...(args.unitMeta ? { unitMeta: args.unitMeta } : {})
  };

  const patch: NotebookPatch = {
    description: `Add external '${row.name}' to model '${args.modelId}'.`,
    operations: [
      {
        op: "add",
        path: `/cells/by-id/${escapeJsonPointerSegment(externalsCell.id)}/externals/${insertIndex}`,
        value: row
      }
    ]
  };

  return summarizeNotebookPatchProposal(snapshot, patch);
}

export function createUpdateExternalPatch(
  snapshot: NotebookAssistantSnapshot,
  args: {
    description?: string;
    kind?: ExternalDef["kind"];
    modelId: string;
    unitMeta?: UnitMeta;
    value?: string | number;
    variable: string;
  }
) {
  const externalsCell = resolveExternalsCell(snapshot, args.modelId);
  const { row, rowIndex } = resolveExternalRow(externalsCell, args.variable);
  if (args.description == null && args.kind == null && args.unitMeta == null && args.value == null) {
    throw new Error("Provide at least one external field to update.");
  }

  const updatedRow = {
    ...row,
    ...(args.description != null ? { desc: args.description } : {}),
    ...(args.kind != null ? { kind: args.kind } : {}),
    ...(args.unitMeta != null ? { unitMeta: args.unitMeta } : {}),
    ...(args.value != null ? { valueText: String(args.value) } : {})
  };

  const patch: NotebookPatch = {
    description: `Update external '${updatedRow.name}'.`,
    operations: [
      {
        op: "replace",
        path: `/cells/by-id/${escapeJsonPointerSegment(externalsCell.id)}/externals/${rowIndex}`,
        value: updatedRow
      }
    ]
  };

  return summarizeNotebookPatchProposal(snapshot, patch);
}

export function createAddInitialValuePatch(
  snapshot: NotebookAssistantSnapshot,
  args: { insertAfterVariable?: string; modelId: string; value: string | number; variable: string }
) {
  const initialValuesCell = resolveInitialValuesCell(snapshot, args.modelId);
  ensureInitialValueNameAvailable(initialValuesCell, args.variable);
  const insertIndex = resolveInsertAfterVariableIndex(initialValuesCell.initialValues, args.insertAfterVariable);
  const row = {
    id: createUniqueRowId(initialValuesCell.initialValues.map((initialValue) => initialValue.id), "init", args.variable),
    name: normalizeRequiredName(args.variable, "variable"),
    valueText: String(args.value)
  };

  const patch: NotebookPatch = {
    description: `Add initial value '${row.name}'.`,
    operations: [
      {
        op: "add",
        path: `/cells/by-id/${escapeJsonPointerSegment(initialValuesCell.id)}/initialValues/${insertIndex}`,
        value: row
      }
    ]
  };

  return summarizeNotebookPatchProposal(snapshot, patch);
}

export function createUpdateInitialValuePatch(
  snapshot: NotebookAssistantSnapshot,
  args: { modelId: string; value: string | number; variable: string }
) {
  const initialValuesCell = resolveInitialValuesCell(snapshot, args.modelId);
  const { rowIndex } = resolveInitialValueRow(initialValuesCell, args.variable);

  const patch: NotebookPatch = {
    description: `Update initial value '${args.variable}'.`,
    operations: [
      {
        op: "replace",
        path: `/cells/by-id/${escapeJsonPointerSegment(initialValuesCell.id)}/initialValues/${rowIndex}/valueText`,
        value: String(args.value)
      }
    ]
  };

  return summarizeNotebookPatchProposal(snapshot, patch);
}

export function createUpdateParameterPatch(
  snapshot: NotebookAssistantSnapshot,
  args: { modelId: string; variable: string; value: string | number }
) {
  const cellIndex = snapshot.document.cells.findIndex(
    (cell) => cell.type === "externals" && cell.modelId === args.modelId
  );
  const externalsCell = snapshot.document.cells[cellIndex];
  if (!externalsCell || externalsCell.type !== "externals") {
    throw new Error(`Unknown externals model id: ${args.modelId}`);
  }

  const rowIndex = externalsCell.externals.findIndex((external) => external.name.trim() === args.variable);
  if (rowIndex < 0) {
    throw new Error(`Unknown parameter '${args.variable}' for model '${args.modelId}'.`);
  }

  const patch: NotebookPatch = {
    description: `Update parameter '${args.variable}' to ${String(args.value)}.`,
    operations: [
      {
        op: "replace",
        path: `/cells/by-id/${escapeJsonPointerSegment(externalsCell.id)}/externals/${rowIndex}/valueText`,
        value: String(args.value)
      }
    ]
  };

  return summarizeNotebookPatchProposal(snapshot, patch);
}

export function createUpdateVariableUnitMetaPatch(
  snapshot: NotebookAssistantSnapshot,
  args: { displayUnit?: string; modelId?: string; stockFlow?: UnitMeta["stockFlow"]; unitMeta?: UnitMeta; variable: string }
) {
  const target = resolveVariableUnitMetaTarget(snapshot, args.variable, args.modelId);
  const existingUnitMeta = target.row.unitMeta;
  const unitMeta = normalizeVariableUnitMetaPatchValue({
    displayUnit: args.displayUnit,
    existingUnitMeta,
    stockFlow: args.stockFlow,
    unitMeta: args.unitMeta
  });

  const patch: NotebookPatch = {
    description: `Update '${target.variable}' unit metadata.`,
    operations: [
      {
        op: "replace",
        path: `/cells/by-id/${escapeJsonPointerSegment(target.cell.id)}/${target.property}/${target.rowIndex}/unitMeta`,
        value: unitMeta
      }
    ]
  };

  return summarizeNotebookPatchProposal(snapshot, patch);
}


