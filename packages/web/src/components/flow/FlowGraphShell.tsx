import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Background,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type EdgeTypes,
  type CoordinateExtent,
  type Node,
  type NodeTypes,
  type OnNodesChange,
  type ProOptions
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

const proOptions: ProOptions = { hideAttribution: true };

const FIT_VIEW_OPTIONS = { padding: 0.12, duration: 0, maxZoom: 1, minZoom: 0.08 } as const;
const MIN_VIEWPORT_SIZE = 280;

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
  fitViewRequest = 0,
  nodes,
  nodeTypes,
  onNodeClick,
  onNodeDrag,
  onNodeDragStart,
  onNodeDragStop,
  onNodeMouseEnter,
  onNodeMouseLeave,
  nodeExtent,
  onNodesChange,
  nodesDraggable = false,
  panActivationKeyCode = null,
  panOnDrag = true,
  elementsSelectable = true,
  viewportHeight,
  viewportWidth
}: {
  ariaLabel: string;
  canvasHeight: number;
  canvasWidth: number;
  children?: ReactNode;
  edges: Edge[];
  edgeTypes?: EdgeTypes;
  elementsSelectable?: boolean;
  fitViewKey: string;
  fitViewRequest?: number;
  nodes: Node[];
  nodeTypes?: NodeTypes;
  onNodeClick?: (event: React.MouseEvent, node: Node) => void;
  onNodeDrag?: (event: React.MouseEvent, node: Node) => void;
  onNodeDragStart?: (event: React.MouseEvent, node: Node) => void;
  onNodeDragStop?: (event: React.MouseEvent, node: Node) => void;
  onNodeMouseEnter?: (event: React.MouseEvent, node: Node) => void;
  onNodeMouseLeave?: (event: React.MouseEvent, node: Node) => void;
  nodeExtent?: CoordinateExtent;
  onNodesChange?: OnNodesChange<Node>;
  nodesDraggable?: boolean;
  panActivationKeyCode?: string | null;
  panOnDrag?: boolean | number[];
  viewportHeight: number;
  viewportWidth: number;
}) {
  const { fitView } = useReactFlow();

  const runFitView = useCallback(() => {
    fitView(FIT_VIEW_OPTIONS);
  }, [fitView]);

  useEffect(() => {
    runFitView();
  }, [runFitView, fitViewKey, canvasWidth, canvasHeight, viewportWidth, viewportHeight]);

  useEffect(() => {
    if (fitViewRequest <= 0) {
      return;
    }

    runFitView();
  }, [fitViewRequest, runFitView]);

  return (
    <ReactFlow
      aria-label={ariaLabel}
      edges={edges}
      edgeTypes={edgeTypes}
      elementsSelectable={elementsSelectable}
      fitView
      fitViewOptions={{ includeHiddenNodes: false, padding: 0.12 }}
      maxZoom={1.25}
      minZoom={0.08}
      nodes={nodes}
      nodeTypes={nodeTypes}
      nodesConnectable={false}
      nodeExtent={nodeExtent}
      nodesDraggable={nodesDraggable}
      onlyRenderVisibleElements={false}
      panActivationKeyCode={panActivationKeyCode}
      onNodeClick={onNodeClick}
      onNodeDrag={onNodeDrag}
      onNodeDragStart={onNodeDragStart}
      onNodeDragStop={onNodeDragStop}
      onNodeMouseEnter={onNodeMouseEnter}
      onNodeMouseLeave={onNodeMouseLeave}
      onNodesChange={onNodesChange}
      panOnDrag={panOnDrag}
      panOnScroll={false}
      preventScrolling
      proOptions={proOptions}
      style={{ width: viewportWidth, height: viewportHeight }}
      zoomActivationKeyCode={null}
      zoomOnDoubleClick={false}
      zoomOnPinch
      zoomOnScroll
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
  fitViewRequest?: number;
  minViewportWidth?: number;
  nodes: Node[];
  nodeTypes?: NodeTypes;
  onNodeClick?: (event: React.MouseEvent, node: Node) => void;
  onNodeDrag?: (event: React.MouseEvent, node: Node) => void;
  onNodeDragStart?: (event: React.MouseEvent, node: Node) => void;
  onNodeDragStop?: (event: React.MouseEvent, node: Node) => void;
  onNodeMouseEnter?: (event: React.MouseEvent, node: Node) => void;
  onNodeMouseLeave?: (event: React.MouseEvent, node: Node) => void;
  nodeExtent?: CoordinateExtent;
  onNodesChange?: OnNodesChange<Node>;
  nodesDraggable?: boolean;
  panActivationKeyCode?: string | null;
  panOnDrag?: boolean | number[];
  elementsSelectable?: boolean;
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
  fitViewRequest = 0,
  minViewportWidth = 360,
  nodes,
  nodeTypes,
  onNodeClick,
  onNodeDrag,
  onNodeDragStart,
  onNodeDragStop,
  onNodeMouseEnter,
  onNodeMouseLeave,
  nodeExtent,
  onNodesChange,
  nodesDraggable = false,
  panActivationKeyCode = null,
  panOnDrag = true,
  elementsSelectable = true
}: FlowGraphShellProps) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const [viewportSize, setViewportSize] = useState({
    width: Math.max(MIN_VIEWPORT_SIZE, minViewportWidth),
    height: Math.max(MIN_VIEWPORT_SIZE, canvasHeight)
  });

  const updateViewportSize = useCallback(() => {
    const shell = shellRef.current;
    if (!shell) {
      return;
    }

    const rect = shell.getBoundingClientRect();
    const horizontalInsets = readHorizontalInsets(shell);
    setViewportSize({
      width: Math.max(MIN_VIEWPORT_SIZE, Math.floor(rect.width - horizontalInsets)),
      height: Math.max(MIN_VIEWPORT_SIZE, Math.floor(rect.height))
    });
  }, []);

  useEffect(() => {
    updateViewportSize();

    if (typeof ResizeObserver !== "undefined" && shellRef.current) {
      const observer = new ResizeObserver(() => updateViewportSize());
      observer.observe(shellRef.current);
      return () => observer.disconnect();
    }

    window.addEventListener("resize", updateViewportSize);
    return () => window.removeEventListener("resize", updateViewportSize);
  }, [canvasHeight, minViewportWidth, updateViewportSize]);

  return (
    <div
      ref={shellRef}
      className="sequence-canvas-shell flow-graph-shell"
      role="region"
      aria-label={ariaLabel}
      style={{
        height: canvasHeight,
        maxHeight: "75vh",
        width: "100%"
      }}
    >
      <div className="flow-graph-viewport">
        <ReactFlowProvider>
          <FlowGraphViewport
            ariaLabel={ariaLabel}
            canvasHeight={canvasHeight}
            canvasWidth={canvasWidth}
            edges={edges}
            edgeTypes={edgeTypes}
            fitViewKey={fitViewKey}
            fitViewRequest={fitViewRequest}
            nodes={nodes}
            nodeTypes={nodeTypes}
            onNodeClick={onNodeClick}
            onNodeDrag={onNodeDrag}
            onNodeDragStart={onNodeDragStart}
            onNodeDragStop={onNodeDragStop}
            onNodeMouseEnter={onNodeMouseEnter}
            onNodeMouseLeave={onNodeMouseLeave}
            nodeExtent={nodeExtent}
            onNodesChange={onNodesChange}
            nodesDraggable={nodesDraggable}
            panActivationKeyCode={panActivationKeyCode}
            panOnDrag={panOnDrag}
            elementsSelectable={elementsSelectable}
            viewportHeight={viewportSize.height}
            viewportWidth={viewportSize.width}
          >
            {children}
          </FlowGraphViewport>
        </ReactFlowProvider>
      </div>
    </div>
  );
}
