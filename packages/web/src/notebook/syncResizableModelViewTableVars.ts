const RESIZABLE_MODEL_VIEW_TABLE_VARS = [
  "--eq-col-variable-width",
  "--eq-col-expression-width",
  "--eq-col-role-width"
] as const;

const RESIZABLE_MODEL_VIEW_LAYOUT_CLASSES = [
  "layout-equation-view",
  "layout-external-view",
  "layout-initial-view"
] as const;

export function syncResizableModelViewTableVars(source: HTMLElement, target: HTMLElement): void {
  const computed = getComputedStyle(source);
  for (const variable of RESIZABLE_MODEL_VIEW_TABLE_VARS) {
    target.style.setProperty(variable, computed.getPropertyValue(variable));
  }

  for (const layoutClass of RESIZABLE_MODEL_VIEW_LAYOUT_CLASSES) {
    target.classList.remove(layoutClass);
  }
  for (const layoutClass of RESIZABLE_MODEL_VIEW_LAYOUT_CLASSES) {
    if (source.classList.contains(layoutClass)) {
      target.classList.add(layoutClass);
      break;
    }
  }

  target.classList.toggle("initial-column-collapsed", source.classList.contains("initial-column-collapsed"));
  target.classList.toggle("current-column-collapsed", source.classList.contains("current-column-collapsed"));
  target.classList.toggle("gain-column-collapsed", source.classList.contains("gain-column-collapsed"));
  target.classList.toggle("role-column-collapsed", source.classList.contains("role-column-collapsed"));
}
