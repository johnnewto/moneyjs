import { describe, expect, it } from "vitest";

import {
  computeFlowGraphShellHeightForWidthFit,
  computeFlowGraphWidthFitZoom,
  FLOW_GRAPH_FIT_PADDING
} from "../src/components/flow/flowGraphShellLayout";

describe("flowGraphShellLayout", () => {
  it("sizes shell height so width-fit zoom matches height-fit zoom", () => {
    const canvasWidth = 1200;
    const canvasHeight = 2000;
    const viewportWidth = 1000;
    const shellHeight = computeFlowGraphShellHeightForWidthFit(
      canvasWidth,
      canvasHeight,
      viewportWidth
    );
    const zoom = computeFlowGraphWidthFitZoom(canvasWidth, viewportWidth);

    expect(zoom).toBeCloseTo((viewportWidth * (1 - FLOW_GRAPH_FIT_PADDING * 2)) / canvasWidth, 5);
    expect(shellHeight * (1 - FLOW_GRAPH_FIT_PADDING * 2)).toBeCloseTo(canvasHeight * zoom, 0);
  });
});
