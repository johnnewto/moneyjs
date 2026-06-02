const RESIZABLE_MODEL_VIEW_TABLE_VARS = [
  "--eq-col-variable-width",
  "--eq-col-expression-width",
  "--eq-col-role-width"
] as const;

export function syncResizableModelViewTableVars(source: HTMLElement, target: HTMLElement): void {
  const computed = getComputedStyle(source);
  for (const variable of RESIZABLE_MODEL_VIEW_TABLE_VARS) {
    target.style.setProperty(variable, computed.getPropertyValue(variable));
  }
}
