// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useMultiportEdgeAnimation } from "../src/hooks/useMultiportEdgeAnimation";

describe("useMultiportEdgeAnimation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-25T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("animates while visible and stops after ten seconds", () => {
    const { result } = renderHook(() => useMultiportEdgeAnimation());

    expect(result.current.shouldAnimateEdges).toBe(true);

    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(result.current.shouldAnimateEdges).toBe(false);
  });

  it("restarts the animation window when interactionEpoch changes", () => {
    const { result, rerender } = renderHook(
      ({ interactionEpoch }: { interactionEpoch: number }) =>
        useMultiportEdgeAnimation({ interactionEpoch }),
      { initialProps: { interactionEpoch: 0 } }
    );

    act(() => {
      vi.advanceTimersByTime(9_000);
    });
    expect(result.current.shouldAnimateEdges).toBe(true);

    rerender({ interactionEpoch: 1 });

    act(() => {
      vi.advanceTimersByTime(9_000);
    });
    expect(result.current.shouldAnimateEdges).toBe(true);

    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(result.current.shouldAnimateEdges).toBe(false);
  });
});
