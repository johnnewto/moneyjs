// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import {
  confirmUnsavedNavigation,
  isInternalNavigationHref,
  resolveNavigationTarget
} from "../src/lib/unsavedChangesGuard";

describe("unsavedChangesGuard helpers", () => {
  it("confirms only when dirty", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);

    expect(confirmUnsavedNavigation(false)).toBe(true);
    expect(confirm).not.toHaveBeenCalled();

    expect(confirmUnsavedNavigation(true, "Leave?")).toBe(true);
    expect(confirm).toHaveBeenCalledWith("Leave?");

    confirm.mockRestore();
  });

  it("recognizes internal navigation hrefs", () => {
    expect(isInternalNavigationHref("#/notebook")).toBe(true);
    expect(isInternalNavigationHref("/notebook/bmw")).toBe(true);
    expect(isInternalNavigationHref("https://example.com")).toBe(false);
  });

  it("resolves navigation targets relative to the current location", () => {
    window.history.replaceState(null, "", "/notebook/bmw");

    expect(resolveNavigationTarget("#/notebook")).toBe("/notebook/bmw#/notebook");
  });
});
