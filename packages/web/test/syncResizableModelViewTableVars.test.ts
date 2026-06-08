// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { syncResizableModelViewTableVars } from "../src/notebook/syncResizableModelViewTableVars";

describe("syncResizableModelViewTableVars", () => {
  it("copies equation-view column width variables to the floating table shell", () => {
    const source = document.createElement("div");
    source.className = "notebook-model-view-table-resizable layout-equation-view";
    source.style.setProperty("--eq-col-variable-width", "180px");
    source.style.setProperty("--eq-col-expression-width", "320px");
    source.style.setProperty("--eq-col-role-width", "72px");

    const target = document.createElement("div");

    syncResizableModelViewTableVars(source, target);

    expect(target.style.getPropertyValue("--eq-col-variable-width")).toBe("180px");
    expect(target.style.getPropertyValue("--eq-col-expression-width")).toBe("320px");
    expect(target.style.getPropertyValue("--eq-col-role-width")).toBe("72px");
    expect(target.classList.contains("layout-equation-view")).toBe(true);
  });

  it("copies external-view layout class to the floating table shell", () => {
    const source = document.createElement("div");
    source.className = "notebook-model-view-table-resizable layout-external-view";

    const target = document.createElement("div");

    syncResizableModelViewTableVars(source, target);

    expect(target.classList.contains("layout-external-view")).toBe(true);
  });

  it("copies column collapse classes to the floating table shell", () => {
    const source = document.createElement("div");
    source.className =
      "notebook-model-view-table-resizable layout-equation-view initial-column-collapsed current-column-collapsed gain-column-collapsed role-column-collapsed";

    const target = document.createElement("div");

    syncResizableModelViewTableVars(source, target);

    expect(target.classList.contains("initial-column-collapsed")).toBe(true);
    expect(target.classList.contains("current-column-collapsed")).toBe(true);
    expect(target.classList.contains("gain-column-collapsed")).toBe(true);
    expect(target.classList.contains("role-column-collapsed")).toBe(true);
  });
});
