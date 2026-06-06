import { useEffect, useMemo, useState } from "react";

import {
  buildInitialValueRecommendations,
  DEFAULT_INITIAL_VALUE_RECOMMENDATION_CRITERIA,
  hasActiveInitialValueRecommendationCriteria,
  type InitialValueRecommendationCriteria
} from "../initialValueRecommendations";
import { isRowComment, type EquationListItem, type InitialValueListItem } from "@sfcr/notebook-core";
import type { NotebookCell } from "../types";

const CHECKLIST_ITEMS: Array<{
  key: keyof InitialValueRecommendationCriteria;
  label: string;
  description: string;
}> = [
  {
    key: "lagged",
    label: "Lagged",
    description: "Variable appears in X', lag(X), or X[-1] anywhere"
  },
  {
    key: "stock",
    label: "Stock",
    description: "Accumulation/integral equation, or unitMeta.stockFlow: stock"
  },
  {
    key: "denominator",
    label: "Denominator",
    description: "Variable is a divisor in any equation"
  },
  {
    key: "balanceSheet",
    label: "Balance sheet",
    description: "Variable appears in a balance-sheet matrix cell"
  }
];

export function InitialValueEnableDialog({
  cells,
  equations,
  initialValues,
  isOpen,
  onApply,
  onCancel
}: {
  cells: NotebookCell[];
  equations: EquationListItem[];
  initialValues: InitialValueListItem[];
  isOpen: boolean;
  onApply(criteria: InitialValueRecommendationCriteria): void;
  onCancel(): void;
}) {
  const [criteria, setCriteria] = useState<InitialValueRecommendationCriteria>(
    DEFAULT_INITIAL_VALUE_RECOMMENDATION_CRITERIA
  );

  useEffect(() => {
    if (isOpen) {
      setCriteria(DEFAULT_INITIAL_VALUE_RECOMMENDATION_CRITERIA);
    }
  }, [isOpen]);

  const preview = useMemo(() => {
    if (!isOpen || !hasActiveInitialValueRecommendationCriteria(criteria)) {
      return null;
    }

    return buildInitialValueRecommendations({
      equations,
      cells,
      criteria
    });
  }, [cells, criteria, equations, isOpen]);

  if (!isOpen) {
    return null;
  }

  const activeCriteria = hasActiveInitialValueRecommendationCriteria(criteria);
  const matchCount = preview?.recommendations.length ?? 0;
  const existingNamedCount = initialValues.filter(
    (row) => !isRowComment(row) && row.name.trim() !== ""
  ).length;

  return (
    <div className="notebook-cell-delete-dialog-backdrop" onClick={onCancel}>
      <div
        className="notebook-cell-delete-dialog notebook-confirm-dialog initial-value-enable-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Enable needed initial values"
        onClick={(event) => event.stopPropagation()}
      >
        <h3>Enable needed initial values</h3>
        <p>
          Choose which checklist items to test. Matching variables will be enabled; other named rows
          will be disabled.
        </p>
        <div className="initial-value-enable-dialog-checklist" role="group" aria-label="Checklist">
          {CHECKLIST_ITEMS.map((item) => {
            const checkboxId = `initial-value-enable-${item.key}`;
            return (
              <label key={item.key} className="initial-value-enable-dialog-item" htmlFor={checkboxId}>
                <input
                  id={checkboxId}
                  aria-label={item.label}
                  checked={criteria[item.key]}
                  onChange={(event) =>
                    setCriteria((current) => ({
                      ...current,
                      [item.key]: event.target.checked
                    }))
                  }
                  type="checkbox"
                />
                <span className="initial-value-enable-dialog-item-copy">
                  <strong>{item.label}</strong>
                  <span>{item.description}</span>
                </span>
              </label>
            );
          })}
        </div>
        <p className="initial-value-enable-dialog-preview" role="status">
          {!activeCriteria
            ? "Select at least one checklist item."
            : matchCount === 0
              ? "No variables match the selected checklist."
              : `${matchCount} ${matchCount === 1 ? "variable matches" : "variables match"} the selected checklist (${existingNamedCount} named row${existingNamedCount === 1 ? "" : "s"} currently in the list).`}
        </p>
        <div className="notebook-cell-delete-dialog-actions notebook-confirm-dialog-actions">
          <button className="secondary-button" onClick={onCancel} type="button">
            Cancel
          </button>
          <button disabled={!activeCriteria} onClick={() => onApply(criteria)} type="button">
            Enable matching
          </button>
        </div>
      </div>
    </div>
  );
}
