import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import {
  type Edge,
  type Node,
  type NodeTypes,
  useNodesState
} from "@xyflow/react";

import type { ParsedDiagram } from "../notebook/sequence";
import { FlowGraphShell } from "./flow/FlowGraphShell";
import { MatrixMultiportNode, MatrixMultiportNoteNode } from "./flow/MatrixMultiportNode";
import {
  MultiportVariableInspectProvider,
  type MultiportVariableInspectContextValue
} from "./flow/MultiportVariableInspectContext";
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

function withMultiportDrag(nodes: Node[], enabled: boolean): Node[] {
  if (!enabled) {
    return nodes;
  }

  return nodes.map((node) =>
    node.type === "matrixMultiport"
      ? {
          ...node,
          draggable: true,
          className: "matrix-multiport-node is-reorderable"
        }
      : node
  );
}

const nodeTypes: NodeTypes = {
  matrixMultiport: MatrixMultiportNode,
  matrixMultiportNote: MatrixMultiportNoteNode
};

export interface TransactionFlowMultiportCanvasProps {
  diagram: ParsedDiagram;
  fitViewRequest?: number;
  inspectContext: MultiportVariableInspectContextValue;
  participantColumnOrder?: string[] | null;
  onParticipantColumnOrderChange?: (order: string[]) => void;
  visibleStepCount: number;
  highlightedStepIndex: number | null;
}

function buildLayout(
  diagram: ParsedDiagram,
  columnOrder: string[],
  visibleStepCount: number,
  highlightedStepIndex: number | null
) {
  const orderedDiagram = applyParticipantColumnOrder(diagram, columnOrder);
  return buildTransactionFlowMultiportLayout(orderedDiagram, visibleStepCount, highlightedStepIndex);
}

export function TransactionFlowMultiportCanvas({
  diagram,
  fitViewRequest = 0,
  inspectContext,
  participantColumnOrder = null,
  onParticipantColumnOrderChange,
  visibleStepCount,
  highlightedStepIndex
}: TransactionFlowMultiportCanvasProps) {
  const participantIds = useMemo(
    () => diagram.participants.map((participant) => participant.id),
    [diagram.participants]
  );
  const columnOrder = useMemo(
    () => sanitizeParticipantColumnOrder(participantIds, participantColumnOrder),
    [participantColumnOrder, participantIds]
  );
  const baseLayout = useMemo(
    () => buildLayout(diagram, columnOrder, visibleStepCount, highlightedStepIndex),
    [columnOrder, diagram, highlightedStepIndex, visibleStepCount]
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
    () => withMultiportDrag(baseLayout.nodes, canReorder),
    [baseLayout.nodes, canReorder]
  );
  const [nodes, setNodes, onNodesChange] = useNodesState(layoutNodes);
  const [edges, setEdges] = useState<Edge[]>(baseLayout.edges);
  const isDraggingRef = useRef(false);
  const previewOrderRef = useRef(columnOrder);

  useEffect(() => {
    previewOrderRef.current = columnOrder;
  }, [columnOrder]);

  useEffect(() => {
    if (isDraggingRef.current) {
      return;
    }
    setNodes(withMultiportDrag(baseLayout.nodes, canReorder));
    setEdges(baseLayout.edges);
  }, [baseLayout, canReorder, setNodes]);

  const applyPreviewOrder = useCallback(
    (previewOrder: string[]) => {
      const previewLayout = buildLayout(
        diagram,
        previewOrder,
        visibleStepCount,
        highlightedStepIndex
      );
      const positionById = new Map(
        previewLayout.nodes.map((node) => [node.id, node.position] as const)
      );

      setNodes((current) =>
        current.map((node) => {
          const nextPosition = positionById.get(node.id);
          if (!nextPosition) {
            return node;
          }
          return {
            ...node,
            position: { x: nextPosition.x, y: nextPosition.y }
          };
        })
      );
      setEdges(previewLayout.edges);
    },
    [diagram, highlightedStepIndex, setNodes, visibleStepCount]
  );

  const handleNodeDragStart = useCallback(() => {
    isDraggingRef.current = true;
    previewOrderRef.current = columnOrder;
  }, [columnOrder]);

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
      if (!canReorder || node.type !== "matrixMultiport") {
        setNodes(withMultiportDrag(baseLayout.nodes, canReorder));
        setEdges(baseLayout.edges);
        return;
      }

      const targetSlot = slotFromMultiportX(node.position.x, previewOrderRef.current.length);
      const nextOrder = reorderParticipantIds(previewOrderRef.current, node.id, targetSlot);
      previewOrderRef.current = nextOrder;
      onParticipantColumnOrderChange(nextOrder);
    },
    [baseLayout, canReorder, onParticipantColumnOrderChange, setNodes]
  );

  return (
    <MultiportVariableInspectProvider value={inspectContext}>
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
        onNodesChange={onNodesChange}
        panActivationKeyCode={null}
        panOnDrag
        onNodeDrag={canReorder ? handleNodeDrag : undefined}
        onNodeDragStart={canReorder ? handleNodeDragStart : undefined}
        onNodeDragStop={canReorder ? handleNodeDragStop : undefined}
        elementsSelectable={false}
      />
    </MultiportVariableInspectProvider>
  );
}
