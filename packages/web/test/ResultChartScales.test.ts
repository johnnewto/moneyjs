import { describe, expect, it } from "vitest";

import {
  applyTimeRangeDrag,
  clampInteractiveTimeRange,
  periodFromSvgX
} from "../src/components/ResultChartScales";

describe("ResultChartScales time range slider helpers", () => {
  const leftPadding = 56;
  const plotWidth = 824;
  const seriesLength = 12;

  it("maps svg x positions to 1-based periods", () => {
    expect(periodFromSvgX(leftPadding, leftPadding, plotWidth, seriesLength)).toBe(1);
    expect(periodFromSvgX(leftPadding + plotWidth, leftPadding, plotWidth, seriesLength)).toBe(12);
    expect(periodFromSvgX(620, leftPadding, plotWidth, seriesLength)).toBe(9);
  });

  it("clamps invalid interactive ranges to at least two periods", () => {
    expect(clampInteractiveTimeRange({ startPeriodInclusive: 12, endPeriodInclusive: 1 }, seriesLength)).toEqual({
      startPeriodInclusive: 1,
      endPeriodInclusive: 12
    });
    expect(clampInteractiveTimeRange({ startPeriodInclusive: 5, endPeriodInclusive: 5 }, seriesLength)).toEqual({
      startPeriodInclusive: 5,
      endPeriodInclusive: 6
    });
  });

  it("shrinks the end handle drag to the requested period", () => {
    expect(
      applyTimeRangeDrag({
        leftPadding,
        mode: "end",
        nextX: 620,
        originEnd: 12,
        originStart: 1,
        originX: leftPadding + plotWidth,
        plotWidth,
        seriesLength
      })
    ).toEqual({
      startPeriodInclusive: 1,
      endPeriodInclusive: 9
    });
  });

  it("anchors the start handle drag to the window end captured at pointer down", () => {
    expect(
      applyTimeRangeDrag({
        leftPadding,
        mode: "start",
        nextX: 300,
        originEnd: 12,
        originStart: 1,
        originX: leftPadding,
        plotWidth,
        seriesLength
      })
    ).toEqual({
      startPeriodInclusive: 4,
      endPeriodInclusive: 12
    });
  });

  it("pans the selected window without changing its width", () => {
    expect(
      applyTimeRangeDrag({
        leftPadding,
        mode: "pan",
        nextX: leftPadding + plotWidth / 2,
        originEnd: 8,
        originStart: 3,
        originX: leftPadding,
        plotWidth,
        seriesLength
      })
    ).toEqual({
      startPeriodInclusive: 7,
      endPeriodInclusive: 12
    });
  });
});
