import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Background,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type EdgeTypes,
  type Node,
  type NodeTypes,
  type ProOptions
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useDragScroll } from "../../hooks/useDragScroll";

const proOptions: ProOptions = { hideAttribution: true };

function readHorizontalInsets(element: HTMLElement | null): number {
  if (!element) {
    return 0;
  }

  const styles = window.getComputedStyle(element);
  const left = Number.parseFloat(styles.paddingLeft);
  const right = Number.parseFloat(styles.paddingRight);
  const borderLeft = Number.parseFloat(styles.borderLeftWidth);
  const borderRight = Number.parseFloat(styles.borderRightWidth);

  return (
    (Number.isFinite(left) ? left : 0) +
    (Number.isFinite(right) ? right : 0) +
    (Number.isFinite(borderLeft) ? borderLeft : 0) +
    (Number.isFinite(borderRight) ? borderRight : 0)
  );
}

function FlowGraphViewport({
  ariaLabel,
  canvasHeight,
  canvasWidth,
  children,
  edges,
  edgeTypes,
  fitViewKey,
  minViewportWidth,
  nodes,
  nodeTypes,
  onNodeClick,
  onNodeMouseEnter,
  onNodeMouseLeave
}: {
  ariaLabel: string;
  canvasHeight: number;
  canvasWidth: number;
  children?: ReactNode;
  edges: Edge[];
  edgeTypes?: EdgeTypes;
  fitViewKey: string;
  minViewportWidth: number;
  nodes: Node[];
  nodeTypes?: NodeTypes;
  onNodeClick?: (event: React.MouseEvent, node: Node) => void;
  onNodeMouseEnter?: (event: React.MouseEvent, node: Node) => void;
  onNodeMouseLeave?: (event: React.MouseEvent, node: Node) => void;
}) {
  const { fitView } = useReactFlow();

  useEffect(() => {
    fitView({ padding: 0.12, duration: 0, maxZoom: 1, minZoom: 0.35 });
  }, [fitView, fitViewKey, canvasWidth, canvasHeight]);

  return (
    <ReactFlow
      aria-label={ariaLabel}
      edges={edges}
      edgeTypes={edgeTypes}
      elementsSelectable
      fitView
      fitViewOptions={{ includeHiddenNodes: false, padding: 0.12 }}
      maxZoom={1.25}
      minZoom={0.35}
      nodes={nodes}
      nodeTypes={nodeTypes}
      nodesConnectable={false}
      nodesDraggable={false}
      onlyRenderVisibleElements={false}
      onNodeClick={onNodeClick}
      onNodeMouseEnter={onNodeMouseEnter}
      onNodeMouseLeave={onNodeMouseLeave}
      panOnDrag
      panOnScroll={false}
      proOptions={proOptions}
      style={{ width: Math.max(minViewportWidth, canvasWidth), height: canvasHeight }}
      zoomOnDoubleClick={false}
      zoomOnPinch={false}
      zoomOnScroll={false}
    >
      <Background gap={18} size={1} color="rgba(148, 163, 184, 0.18)" />
      {children}
    </ReactFlow>
  );
}

export interface FlowGraphShellProps {
  ariaLabel: string;
  canvasHeight: number;
  canvasWidth: number;
  edges: Edge[];
  edgeTypes?: EdgeTypes;
  fitViewKey: string;
  minViewportWidth?: number;
  nodes: Node[];
  nodeTypes?: NodeTypes;
  onNodeClick?: (event: React.MouseEvent, node: Node) => void;
  onNodeMouseEnter?: (event: React.MouseEvent, node: Node) => void;
  onNodeMouseLeave?: (event: React.MouseEvent, node: Node) => void;
  children?: ReactNode;
}

export function FlowGraphShell({
  ariaLabel,
  canvasHeight,
  canvasWidth,
  children,
  edges,
  edgeTypes,
  fitViewKey,
  minViewportWidth = 360,
  nodes,
  nodeTypes,
  onNodeClick,
  onNodeMouseEnter,
  onNodeMouseLeave
}: FlowGraphShellProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasDragScroll = useDragScroll<HTMLDivElement>();
  const [viewportWidth, setViewportWidth] = useState(Math.max(minViewportWidth, canvasWidth));

  useEffect(() => {
    function updateWidth(): void {
      const wrapper = wrapperRef.current;
      const measuredWidth = wrapper?.getBoundingClientRect().width ?? minViewportWidth;
      const horizontalInsets = readHorizontalInsets(wrapper);
      setViewportWidth(Math.max(minViewportWidth, canvasWidth, Math.floor(measuredWidth - horizontalInsets)));
    }

    updateWidth();

    if (typeof ResizeObserver !== "undefined" && wrapperRef.current) {
      const observer = new ResizeObserver(() => updateWidth());
      observer.observe(wrapperRef.current);
      return () => observer.disconnect();
    }

    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, [canvasWidth, minViewportWidth]);

  const effectiveMinWidth = Math.max(viewportWidth, canvasWidth);

  return (
    <div
      ref={(node) => {
        wrapperRef.current = node;
        canvasDragScroll.dragScrollRef.current = node;
      }}
      className={`sequence-canvas-shell flow-graph-shell notebook-oversize-scroll ${canvasDragScroll.dragScrollProps.className}`}
      data-drag-scroll-ignore="true"
      onClickCapture={canvasDragScroll.dragScrollProps.onClickCapture}
      onMouseDown={canvasDragScroll.dragScrollProps.onMouseDown}
      role="region"
      aria-label={ariaLabel}
    >
      <div
        className="flow-graph-viewport"
        style={{
          width: effectiveMinWidth,
          height: canvasHeight,
          minWidth: effectiveMinWidth
        }}
      >
        <ReactFlowProvider>
          <FlowGraphViewport
            ariaLabel={ariaLabel}
            canvasHeight={canvasHeight}
            canvasWidth={canvasWidth}
            edges={edges}
            edgeTypes={edgeTypes}
            fitViewKey={fitViewKey}
            minViewportWidth={effectiveMinWidth}
            nodes={nodes}
            nodeTypes={nodeTypes}
            onNodeClick={onNodeClick}
            onNodeMouseEnter={onNodeMouseEnter}
            onNodeMouseLeave={onNodeMouseLeave}
          >
            {children}
          </FlowGraphViewport>
        </ReactFlowProvider>
      </div>
    </div>
  );
}
