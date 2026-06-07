// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useVariableInitialValueEdit } from "../src/notebook/useVariableInitialValueEdit";

describe("useVariableInitialValueEdit", () => {
  it("creates a new initial value row when applying from an undefined variable", () => {
    const onUpdateInitialValues = vi.fn();
    const { result } = renderHook(() =>
      useVariableInitialValueEdit({
        initialValues: [],
        onUpdateInitialValues
      })
    );

    act(() => {
      result.current.beginEdit("Hh");
      result.current.setDraftValueText("80");
    });

    act(() => {
      result.current.applyEdit();
    });

    expect(onUpdateInitialValues).toHaveBeenCalledTimes(1);
    const nextInitialValues = onUpdateInitialValues.mock.calls[0]?.[0];
    expect(nextInitialValues).toHaveLength(1);
    expect(nextInitialValues[0]).toMatchObject({
      name: "Hh",
      valueText: "80"
    });
  });

  it("updates an existing initial value row", () => {
    const onUpdateInitialValues = vi.fn();
    const { result } = renderHook(() =>
      useVariableInitialValueEdit({
        initialValues: [{ id: "init-1", name: "Hh", valueText: "80" }],
        onUpdateInitialValues
      })
    );

    act(() => {
      result.current.beginEdit("Hh");
      result.current.setDraftValueText("90");
    });

    act(() => {
      result.current.applyEdit();
    });

    expect(onUpdateInitialValues).toHaveBeenCalledWith([
      { id: "init-1", name: "Hh", valueText: "90" }
    ]);
  });
});
