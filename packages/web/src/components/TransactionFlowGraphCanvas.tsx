import { useMemo } from "react";
import { ViewportPortal, type NodeTypes } from "@xyflow/react";

import type { ParsedDiagram } from "../notebook/sequence";
import { FlowGraphShell } from "./flow/FlowGraphShell";
import { MatrixColumnNode } from "./flow/MatrixColumnNode";
import { MatrixNoteNode } from "./flow/MatrixNoteNode";
import { MatrixRowLaneNode } from "./flow/MatrixRowLaneNode";
import { buildTransactionFlowLayout } from "./transactionFlowLayout";
import { TransactionFlowSvgOverlay } from "./TransactionFlowSvgOverlay";

const nodeTypes: NodeTypes = {
  matrixColumn: MatrixColumnNode,
  matrixRowLane: MatrixRowLaneNode,
  matrixNote: MatrixNoteNode
};

export interface TransactionFlowGraphCanvasProps {
  diagram: ParsedDiagram;
  visibleStepCount: number;
  highlightedStepIndex: number | null;
}

export function TransactionFlowGraphCanvas({
  diagram,
  visibleStepCount,
  highlightedStepIndex
}: TransactionFlowGraphCanvasProps) {
  const layout = useMemo(
    () => buildTransactionFlowLayout(diagram, visibleStepCount, highlightedStepIndex),
    [diagram, highlightedStepIndex, visibleStepCount]
  );

  return (
    <FlowGraphShell
      ariaLabel="Transaction flow diagram"
      canvasHeight={layout.height}
      canvasWidth={layout.width}
      edges={[]}
      fitViewKey={`${layout.width}-${layout.height}-${visibleStepCount}-${highlightedStepIndex ?? "none"}`}
      minViewportWidth={Math.max(360, layout.width)}
      nodes={layout.nodes}
      nodeTypes={nodeTypes}
    >
      <ViewportPortal>
        <TransactionFlowSvgOverlay
          edges={layout.edges}
          height={layout.height}
          width={layout.width}
        />
      </ViewportPortal>
    </FlowGraphShell>
  );
}
