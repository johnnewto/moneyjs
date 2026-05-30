export type MatrixEntryDisplayMode = "equation" | "value" | "both";

const MATRIX_ENTRY_DISPLAY_MODE_ORDER: MatrixEntryDisplayMode[] = ["equation", "value", "both"];

export function cycleMatrixEntryDisplayMode(
  current: MatrixEntryDisplayMode = "both"
): MatrixEntryDisplayMode {
  const index = MATRIX_ENTRY_DISPLAY_MODE_ORDER.indexOf(current);
  const nextIndex = index < 0 ? 0 : (index + 1) % MATRIX_ENTRY_DISPLAY_MODE_ORDER.length;
  return MATRIX_ENTRY_DISPLAY_MODE_ORDER[nextIndex] ?? "both";
}

export function formatMatrixEntryDisplayMode(mode: MatrixEntryDisplayMode): string {
  switch (mode) {
    case "equation":
      return "Equation";
    case "value":
      return "Value";
    case "both":
      return "Equation = value";
  }
}
