export const FLOW_GRAPH_FIT_PADDING = 0.04;
export const FLOW_GRAPH_MULTIPORT_FIT_PADDING = 0.01;

/** Viewport height so React Flow fitView is width-limited and columns span the shell. */
export function computeFlowGraphShellHeightForWidthFit(
  canvasWidth: number,
  canvasHeight: number,
  viewportWidth: number,
  padding: number = FLOW_GRAPH_FIT_PADDING
): number {
  if (canvasWidth <= 0 || canvasHeight <= 0 || viewportWidth <= 0) {
    return canvasHeight;
  }

  const widthZoom = (viewportWidth * (1 - padding * 2)) / canvasWidth;
  const contentHeight = canvasHeight * widthZoom;
  return Math.ceil(contentHeight / (1 - padding * 2));
}

export function computeFlowGraphWidthFitZoom(
  canvasWidth: number,
  viewportWidth: number,
  padding: number = FLOW_GRAPH_FIT_PADDING,
  minZoom = 0.08,
  maxZoom = 1.25
): number {
  if (canvasWidth <= 0 || viewportWidth <= 0) {
    return 1;
  }

  const zoom = (viewportWidth * (1 - padding * 2)) / canvasWidth;
  return Math.min(maxZoom, Math.max(minZoom, zoom));
}
