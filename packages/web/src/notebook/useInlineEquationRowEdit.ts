import { useCallback, useMemo, useState } from "react";

import { isRowComment, type EquationListItem } from "@sfcr/notebook-core";

import type { EquationRow } from "../lib/editorModel";
import {
  findModelVariableDefinition,
  formatVariableAlreadyDefinedWarning,
  patchEquationInNotebook,
  replaceIdentifierInSource,
  type ModelRenameScope
} from "./renameVariable";
import type { EquationRowEditFocus } from "./components/EquationRowInlineEditor";
import type { NotebookCell } from "./types";
import { useVariableRenameConfirm } from "./useVariableRenameConfirm";

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
  equations: EquationListItem[];
  onChangeEquations(next: EquationListItem[]): void;
  onReplaceCells(nextCells: NotebookCell[]): void;
  scope: ModelRenameScope;
}) {
  const [editingEquationId, setEditingEquationId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftExpression, setDraftExpression] = useState("");
  const [editFocus, setEditFocus] = useState<EquationRowEditFocus>("expression");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [pendingApply, setPendingApply] = useState<PendingRowApply | null>(null);
  const renameConfirm = useVariableRenameConfirm({ cells, onReplaceCells, scope });

  const validationWarning = useMemo(() => {
    if (!editingEquationId) {
      return null;
    }

    const trimmedName = draftName.trim();
    if (!trimmedName) {
      return null;
    }

    const equation = equations.find((entry) => entry.id === editingEquationId);
    const currentName =
      equation && !isRowComment(equation) ? equation.name.trim() : "";
    if (trimmedName === currentName) {
      return null;
    }

    const definition = findModelVariableDefinition(cells, scope, trimmedName, {
      excludeEquationId: editingEquationId
    });
    if (!definition) {
      return null;
    }

    return formatVariableAlreadyDefinedWarning(trimmedName, definition);
  }, [cells, draftName, editingEquationId, equations, scope]);

  const cancelRowEdit = useCallback(() => {
    setEditingEquationId(null);
    setDraftName("");
    setDraftExpression("");
    setValidationError(null);
    setPendingApply(null);
    renameConfirm.clearRenameDialog();
  }, [renameConfirm]);

  const beginRowEdit = useCallback(
    (equationId: string, focus: EquationRowEditFocus) => {
      const equation = equations.find((entry) => entry.id === equationId);
      if (!equation || isRowComment(equation)) {
        return;
      }

      setEditingEquationId(equationId);
      setDraftName(equation.name);
      setDraftExpression(equation.expression);
      setEditFocus(focus);
      setValidationError(null);
      setPendingApply(null);
      renameConfirm.clearRenameDialog();
    },
    [equations, renameConfirm]
  );

  const commitRowOnly = useCallback(
    (patch: { equationId: string; expression: string; name: string }) => {
      const nextEquations = equations.map((equation) =>
        !isRowComment(equation) && equation.id === patch.equationId
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
    if (!equation || isRowComment(equation)) {
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

    setValidationError(null);

    // A brand-new definition (no prior name) has no existing references to
    // rename, so commit it directly even when the name collides with another
    // variable. The collision is surfaced as a non-blocking warning instead.
    if (!oldName) {
      commitRowOnly({
        equationId: editingEquationId,
        name: trimmedName,
        expression: trimmedExpression
      });
      return;
    }

    const nextPendingApply = {
      equationId: editingEquationId,
      expression: trimmedExpression,
      name: trimmedName,
      oldName
    };
    setPendingApply(nextPendingApply);
    renameConfirm.openRenameDialog(oldName, trimmedName);
  }, [
    cancelRowEdit,
    commitRowOnly,
    draftExpression,
    draftName,
    editingEquationId,
    equations,
    renameConfirm
  ]);

  const confirmRenameNo = useCallback(() => {
    if (!pendingApply) {
      return;
    }

    renameConfirm.confirmRenameNo(() => commitRowOnly(pendingApply));
  }, [commitRowOnly, pendingApply, renameConfirm]);

  const confirmRenameYes = useCallback(() => {
    if (!pendingApply) {
      return;
    }

    renameConfirm.confirmRenameYes({
      onComplete: cancelRowEdit,
      patch: (nextCells) =>
        patchEquationInNotebook(nextCells, scope, pendingApply.equationId, {
          name: pendingApply.name,
          expression: replaceIdentifierInSource(
            pendingApply.expression,
            pendingApply.oldName,
            pendingApply.name
          )
        })
    });
  }, [cancelRowEdit, pendingApply, renameConfirm, scope]);

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
    renameDialog: renameConfirm.renameDialog,
    renameReferenceCount: renameConfirm.renameReferenceCount,
    setDraftExpression,
    setDraftName,
    validationError,
    validationWarning
  };
}
