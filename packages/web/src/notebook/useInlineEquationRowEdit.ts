import { useCallback, useState } from "react";

import type { EquationRow } from "../lib/editorModel";
import {
  countVariableReferences,
  isModelVariableNameAvailable,
  patchEquationInNotebook,
  renameVariableInNotebook,
  type ModelRenameScope
} from "./renameVariable";
import type { EquationRowEditFocus } from "./components/EquationRowInlineEditor";
import type { NotebookCell } from "./types";

export interface PendingRowApply {
  equationId: string;
  expression: string;
  name: string;
  oldName: string;
}

export function useInlineEquationRowEdit({
  cells,
  equations,
  onChangeEquations,
  onReplaceCells,
  scope
}: {
  cells: NotebookCell[];
  equations: EquationRow[];
  onChangeEquations(next: EquationRow[]): void;
  onReplaceCells(nextCells: NotebookCell[]): void;
  scope: ModelRenameScope;
}) {
  const [editingEquationId, setEditingEquationId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftExpression, setDraftExpression] = useState("");
  const [editFocus, setEditFocus] = useState<EquationRowEditFocus>("expression");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [renameDialog, setRenameDialog] = useState<PendingRowApply | null>(null);

  const cancelRowEdit = useCallback(() => {
    setEditingEquationId(null);
    setDraftName("");
    setDraftExpression("");
    setValidationError(null);
    setRenameDialog(null);
  }, []);

  const beginRowEdit = useCallback(
    (equationId: string, focus: EquationRowEditFocus) => {
      const equation = equations.find((entry) => entry.id === equationId);
      if (!equation) {
        return;
      }

      setEditingEquationId(equationId);
      setDraftName(equation.name);
      setDraftExpression(equation.expression);
      setEditFocus(focus);
      setValidationError(null);
      setRenameDialog(null);
    },
    [equations]
  );

  const commitRowOnly = useCallback(
    (patch: { equationId: string; expression: string; name: string }) => {
      const nextEquations = equations.map((equation) =>
        equation.id === patch.equationId
          ? {
              ...equation,
              name: patch.name,
              expression: patch.expression
            }
          : equation
      );
      onChangeEquations(nextEquations);
      cancelRowEdit();
    },
    [cancelRowEdit, equations, onChangeEquations]
  );

  const applyRowEdit = useCallback(() => {
    if (!editingEquationId) {
      return;
    }

    const equation = equations.find((entry) => entry.id === editingEquationId);
    if (!equation) {
      cancelRowEdit();
      return;
    }

    const trimmedName = draftName.trim();
    const trimmedExpression = draftExpression.trim();
    if (!trimmedName || !trimmedExpression) {
      setValidationError("Variable and expression are required.");
      return;
    }

    const oldName = equation.name.trim();
    const hasNameChange = trimmedName !== oldName;

    if (!hasNameChange) {
      if (
        trimmedName === equation.name.trim() &&
        trimmedExpression === equation.expression.trim()
      ) {
        cancelRowEdit();
        return;
      }

      commitRowOnly({
        equationId: editingEquationId,
        name: trimmedName,
        expression: trimmedExpression
      });
      return;
    }

    if (
      !isModelVariableNameAvailable(cells, scope, trimmedName, {
        excludeEquationId: editingEquationId
      })
    ) {
      setValidationError(`Variable '${trimmedName}' is already defined in this model.`);
      return;
    }

    setValidationError(null);
    setRenameDialog({
      equationId: editingEquationId,
      expression: trimmedExpression,
      name: trimmedName,
      oldName
    });
  }, [
    cancelRowEdit,
    cells,
    commitRowOnly,
    draftExpression,
    draftName,
    editingEquationId,
    equations,
    scope
  ]);

  const confirmRenameNo = useCallback(() => {
    if (!renameDialog) {
      return;
    }

    commitRowOnly(renameDialog);
  }, [commitRowOnly, renameDialog]);

  const confirmRenameYes = useCallback(() => {
    if (!renameDialog) {
      return;
    }

    let nextCells = renameVariableInNotebook(
      cells,
      scope,
      renameDialog.oldName,
      renameDialog.name
    );
    nextCells = patchEquationInNotebook(nextCells, scope, renameDialog.equationId, {
      name: renameDialog.name,
      expression: renameDialog.expression
    });
    onReplaceCells(nextCells);
    cancelRowEdit();
  }, [cancelRowEdit, cells, onReplaceCells, renameDialog, scope]);

  const renameReferenceCount = renameDialog
    ? countVariableReferences(cells, scope, renameDialog.oldName)
    : { cellCount: 0, referenceCount: 0 };

  return {
    applyRowEdit,
    beginRowEdit,
    cancelRowEdit,
    confirmRenameNo,
    confirmRenameYes,
    draftExpression,
    draftName,
    editFocus,
    editingEquationId,
    renameDialog,
    renameReferenceCount,
    setDraftExpression,
    setDraftName,
    validationError
  };
}
