import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import {
  type Edge,
  type Node,
  type NodeTypes,
  useNodesState
} from "@xyflow/react";

import { useMultiportEdgeAnimation } from "../hooks/useMultiportEdgeAnimation";
import type { ParsedDiagram } from "../notebook/sequence";
import { FlowGraphShell } from "./flow/FlowGraphShell";
import { MatrixMultiportNode, MatrixMultiportNoteNode } from "./flow/MatrixMultiportNode";
import {
  MultiportVariableInspectProvider,
  type MultiportVariableInspectContextValue
} from "./flow/MultiportVariableInspectContext";
import { withMultiportEdgeAnimation } from "./multiportEdgeAnimation";
import type { MultiportParticipantStock } from "./multiportParticipantStocks";
import {
  buildTransactionFlowMultiportLayout,
  MULTIPORT_NODE_WIDTH,
  MULTIPORT_X_GAP,
  MULTIPORT_START_X,
  MULTIPORT_START_Y
} from "./transactionFlowMultiportLayout";
import {
  applyParticipantColumnOrder,
  reorderParticipantIds,
  sanitizeParticipantColumnOrder,
  slotFromMultiportX
} from "./transactionFlowMultiportOrder";

function areSameColumnOrder(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function withMultiportReorderDrag(nodes: Node[], enabled: boolean): Node[] {
  if (!enabled) {
    return nodes;
  }

  return nodes.map((node) =>
    node.type === "matrixMultiport"
      ? {
          ...node,
          draggable: true,
          dragHandle: ".matrix-multiport__drag-handle",
          className: "matrix-multiport-node is-reorderable"
        }
      : node
  );
}

const nodeTypes: NodeTypes = {
  matrixMultiport: MatrixMultiportNode,
  matrixMultiportNote: MatrixMultiportNoteNode
};

const EMPTY_PARTICIPANT_STOCKS = new Map<string, MultiportParticipantStock[]>();

export interface TransactionFlowMultiportCanvasProps {
  diagram: ParsedDiagram;
  edgeAnimationEpoch?: number;
  fitViewRequest?: number;
  inspectContext: MultiportVariableInspectContextValue;
  participantColumnOrder?: string[] | null;
  participantStocks?: Map<string, MultiportParticipantStock[]>;
  onParticipantColumnOrderChange?: (order: string[]) => void;
  viewportRoot?: Element | null;
  visibleStepCount: number;
  highlightedStepIndex: number | null;
}

function buildLayout(
  diagram: ParsedDiagram,
  columnOrder: string[],
  visibleStepCount: number,
  highlightedStepIndex: number | null,
  animateEdges: boolean,
  participantStocks: Map<string, MultiportParticipantStock[]>
) {
  const orderedDiagram = applyParticipantColumnOrder(diagram, columnOrder);
  return buildTransactionFlowMultiportLayout(
    orderedDiagram,
    visibleStepCount,
    highlightedStepIndex,
    animateEdges,
    participantStocks
  );
}

function applyPreviewLayoutToNodes(currentNodes: Node[], previewNodes: Node[], canReorder: boolean): Node[] {
  const previewById = new Map(previewNodes.map((node) => [node.id, node] as const));

  return currentNodes.map((node) => {
    const preview = previewById.get(node.id);
    if (!preview) {
      return node;
    }

    const [nextNode] = withMultiportReorderDrag(
      [
        {
          ...node,
          data: preview.data,
          height: preview.height,
          position: { x: preview.position.x, y: preview.position.y },
          width: preview.width
        }
      ],
      canReorder
    );
    return nextNode ?? node;
  });
}

export function TransactionFlowMultiportCanvas({
  diagram,
  edgeAnimationEpoch = 0,
  fitViewRequest = 0,
  inspectContext,
  participantColumnOrder = null,
  participantStocks = EMPTY_PARTICIPANT_STOCKS,
  onParticipantColumnOrderChange,
  viewportRoot = null,
  visibleStepCount,
  highlightedStepIndex
}: TransactionFlowMultiportCanvasProps) {
  const { bumpAnimation, shellRef, shouldAnimateEdges } = useMultiportEdgeAnimation({
    interactionEpoch: edgeAnimationEpoch,
    root: viewportRoot
  });
  const participantIds = useMemo(
    () => diagram.participants.map((participant) => participant.id),
    [diagram.participants]
  );
  const columnOrder = useMemo(
    () => sanitizeParticipantColumnOrder(participantIds, participantColumnOrder),
    [participantColumnOrder, participantIds]
  );
  const baseLayout = useMemo(
    () =>
      buildLayout(
        diagram,
        columnOrder,
        visibleStepCount,
        highlightedStepIndex,
        false,
        participantStocks
      ),
    [columnOrder, diagram, highlightedStepIndex, participantStocks, visibleStepCount]
  );
  const layoutEdges = useMemo(
    () => withMultiportEdgeAnimation(baseLayout.edges, shouldAnimateEdges),
    [baseLayout.edges, shouldAnimateEdges]
  );
  const nodeExtent = useMemo(
    () =>
      [
        [MULTIPORT_START_X - MULTIPORT_X_GAP, MULTIPORT_START_Y],
        [
          baseLayout.width + MULTIPORT_X_GAP + MULTIPORT_NODE_WIDTH,
          baseLayout.height - MULTIPORT_START_Y
        ]
      ] satisfies [[number, number], [number, number]],
    [baseLayout.height, baseLayout.width]
  );
  const canReorder = onParticipantColumnOrderChange != null && diagram.participants.length > 1;
  const layoutNodes = useMemo(
    () => withMultiportReorderDrag(baseLayout.nodes, canReorder),
    [baseLayout.nodes, canReorder]
  );
  const [nodes, setNodes, onNodesChange] = useNodesState(layoutNodes);
  const [edges, setEdges] = useState<Edge[]>(layoutEdges);
  const isDraggingRef = useRef(false);
  const previewOrderRef = useRef(columnOrder);

  useEffect(() => {
    previewOrderRef.current = columnOrder;
  }, [columnOrder]);

  useEffect(() => {
    if (isDraggingRef.current) {
      return;
    }
    setNodes(withMultiportReorderDrag(baseLayout.nodes, canReorder));
    setEdges(layoutEdges);
  }, [baseLayout.nodes, canReorder, layoutEdges, setNodes]);

  useEffect(() => {
    if (fitViewRequest <= 0) {
      return;
    }

    bumpAnimation();
  }, [bumpAnimation, fitViewRequest]);

  const applyPreviewOrder = useCallback(
    (previewOrder: string[]) => {
      const previewLayout = buildLayout(
        diagram,
        previewOrder,
        visibleStepCount,
        highlightedStepIndex,
        shouldAnimateEdges,
        participantStocks
      );

      setNodes((current) =>
        applyPreviewLayoutToNodes(current, previewLayout.nodes, canReorder)
      );
      setEdges(withMultiportEdgeAnimation(previewLayout.edges, shouldAnimateEdges));
    },
    [
      canReorder,
      diagram,
      highlightedStepIndex,
      participantStocks,
      setNodes,
      shouldAnimateEdges,
      visibleStepCount
    ]
  );

  const handleNodeDragStart = useCallback(() => {
    isDraggingRef.current = true;
    previewOrderRef.current = columnOrder;
    bumpAnimation();
  }, [bumpAnimation, columnOrder]);

  const handleNodeDrag = useCallback(
    (_event: MouseEvent, node: Node) => {
      if (!canReorder || node.type !== "matrixMultiport") {
        return;
      }

      const targetSlot = slotFromMultiportX(node.position.x, previewOrderRef.current.length);
      const previewOrder = reorderParticipantIds(previewOrderRef.current, node.id, targetSlot);
      if (previewOrder.join("|") === previewOrderRef.current.join("|")) {
        return;
      }

      previewOrderRef.current = previewOrder;
      applyPreviewOrder(previewOrder);
    },
    [applyPreviewOrder, canReorder]
  );

  const handleNodeDragStop = useCallback(
    (_event: MouseEvent, node: Node) => {
      isDraggingRef.current = false;
      bumpAnimation();
      if (!canReorder || node.type !== "matrixMultiport") {
        setNodes(withMultiportReorderDrag(baseLayout.nodes, canReorder));
        setEdges(layoutEdges);
        return;
      }

      const targetSlot = slotFromMultiportX(node.position.x, previewOrderRef.current.length);
      const nextOrder = reorderParticipantIds(previewOrderRef.current, node.id, targetSlot);
      previewOrderRef.current = nextOrder;
      if (areSameColumnOrder(nextOrder, columnOrder)) {
        setNodes(withMultiportReorderDrag(baseLayout.nodes, canReorder));
        setEdges(layoutEdges);
        return;
      }
      onParticipantColumnOrderChange?.(nextOrder);
    },
    [
      baseLayout,
      bumpAnimation,
      canReorder,
      columnOrder,
      layoutEdges,
      onParticipantColumnOrderChange,
      setNodes
    ]
  );

  const handleMoveEnd = useCallback(() => {
    bumpAnimation();
  }, [bumpAnimation]);

  const handleShellPointerDown = useCallback(() => {
    bumpAnimation();
  }, [bumpAnimation]);

  return (
    <MultiportVariableInspectProvider value={inspectContext}>
      <div
        ref={shellRef}
        className="multiport-flow-animation-shell"
        onPointerDown={handleShellPointerDown}
      >
        <FlowGraphShell
          ariaLabel="Animated multiport transaction flow diagram"
          canvasHeight={baseLayout.height}
          canvasWidth={baseLayout.width}
          edges={edges}
          fitViewKey={`multiport-${baseLayout.width}-${baseLayout.height}-${visibleStepCount}-${highlightedStepIndex ?? "none"}-${columnOrder.join(",")}`}
          fitViewRequest={fitViewRequest}
          minViewportWidth={360}
          nodeExtent={canReorder ? nodeExtent : undefined}
          nodes={nodes}
          nodeTypes={nodeTypes}
          nodesDraggable={canReorder}
          onMoveEnd={handleMoveEnd}
          onNodesChange={onNodesChange}
          panActivationKeyCode={null}
          panOnDrag
          onNodeDrag={canReorder ? handleNodeDrag : undefined}
          onNodeDragStart={canReorder ? handleNodeDragStart : undefined}
          onNodeDragStop={canReorder ? handleNodeDragStop : undefined}
          elementsSelectable={false}
        />
      </div>
    </MultiportVariableInspectProvider>
  );
}
