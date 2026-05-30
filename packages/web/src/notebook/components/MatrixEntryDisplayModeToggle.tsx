import {
  cycleMatrixEntryDisplayMode,
  formatMatrixEntryDisplayMode,
  type MatrixEntryDisplayMode
} from "../matrixEntryDisplay";

export function MatrixEntryDisplayModeToggle({
  mode,
  onChange
}: {
  mode: MatrixEntryDisplayMode;
  onChange(nextMode: MatrixEntryDisplayMode): void;
}) {
  const label = formatMatrixEntryDisplayMode(mode);

  return (
    <button
      type="button"
      className="notebook-run-button notebook-matrix-display-toggle"
      aria-label={`Matrix cell display: ${label}. Activate to change.`}
      title={`Matrix cells show ${label.toLowerCase()}`}
      onClick={() => onChange(cycleMatrixEntryDisplayMode(mode))}
    >
      Cells: {label}
    </button>
  );
}
