import { useMemo, type JSX } from "react";

import {
  buildInitialValueExternalOverlapSummary,
  type InitialValueExternalOverlapSummary
} from "../../lib/initialValueExternalOverlap";
import type { ExternalListItem, InitialValueListItem } from "@sfcr/notebook-core";

export function RemoveInitialValueExternalOverlapDialog({
  externals,
  initialValues,
  isOpen,
  onApply,
  onCancel
}: {
  externals: ExternalListItem[];
  initialValues: InitialValueListItem[];
  isOpen: boolean;
  onApply(summary: InitialValueExternalOverlapSummary): void;
  onCancel(): void;
}): JSX.Element | null {
  const summary = useMemo(() => {
    if (!isOpen) {
      return { overlaps: [] };
    }
    return buildInitialValueExternalOverlapSummary(initialValues, externals);
  }, [externals, initialValues, isOpen]);

  if (!isOpen) {
    return null;
  }

  const overlapCount = summary.overlaps.length;

  return (
    <div className="notebook-cell-delete-dialog-backdrop" onClick={onCancel}>
      <div
        className="notebook-cell-delete-dialog notebook-confirm-dialog initial-value-enable-dialog initial-value-overlap-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Remove external overlaps from initial values"
        onClick={(event) => event.stopPropagation()}
      >
        <h3>Remove external overlaps</h3>
        <p>
          Initial value rows should not reuse names from externals. The rows below will be removed
          from the initial values list; externals are unchanged.
        </p>
        {overlapCount === 0 ? (
          <p className="initial-value-enable-dialog-preview" role="status">
            No initial value rows share a name with an external parameter.
          </p>
        ) : (
          <>
            <p className="initial-value-enable-dialog-preview" role="status">
              {overlapCount} initial value {overlapCount === 1 ? "row overlaps" : "rows overlap"}{" "}
              an external name.
            </p>
            <ul className="initial-value-overlap-dialog-list">
              {summary.overlaps.map((overlap) => (
                <li key={overlap.name}>
                  <strong>{overlap.name}</strong>
                  <span>
                    External ({overlap.externalKind})
                    {overlap.initialValueText
                      ? ` · initial ${overlap.initialValueText}`
                      : " · empty initial value"}
                    {overlap.initialValueEnabled ? "" : " · disabled"}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="notebook-cell-delete-dialog-actions notebook-confirm-dialog-actions">
          <button className="secondary-button" onClick={onCancel} type="button">
            Cancel
          </button>
          <button disabled={overlapCount === 0} onClick={() => onApply(summary)} type="button">
            Remove overlapping rows
          </button>
        </div>
      </div>
    </div>
  );
}
