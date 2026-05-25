import { useMemo } from "react";
import type { NodeTypes } from "@xyflow/react";

import type { ParsedDiagram } from "../notebook/sequence";
import { FlowGraphShell } from "./flow/FlowGraphShell";
import { MatrixMultiportNode, MatrixMultiportNoteNode } from "./flow/MatrixMultiportNode";
import {
  MultiportVariableInspectProvider,
  type MultiportVariableInspectContextValue
} from "./flow/MultiportVariableInspectContext";
import { buildTransactionFlowMultiportLayout } from "./transactionFlowMultiportLayout";

const nodeTypes: NodeTypes = {
  matrixMultiport: MatrixMultiportNode,
  matrixMultiportNote: MatrixMultiportNoteNode
};

export interface TransactionFlowMultiportCanvasProps {
  diagram: ParsedDiagram;
  fitViewRequest?: number;
  inspectContext: MultiportVariableInspectContextValue;
  visibleStepCount: number;
  highlightedStepIndex: number | null;
}

export function TransactionFlowMultiportCanvas({
  diagram,
  fitViewRequest = 0,
  inspectContext,
  visibleStepCount,
  highlightedStepIndex
}: TransactionFlowMultiportCanvasProps) {
  const layout = useMemo(
    () => buildTransactionFlowMultiportLayout(diagram, visibleStepCount, highlightedStepIndex),
    [diagram, highlightedStepIndex, visibleStepCount]
  );

  return (
    <MultiportVariableInspectProvider value={inspectContext}>
      <FlowGraphShell
        ariaLabel="Animated multiport transaction flow diagram"
        canvasHeight={layout.height}
        canvasWidth={layout.width}
        edges={layout.edges}
        fitViewKey={`multiport-${layout.width}-${layout.height}-${visibleStepCount}-${highlightedStepIndex ?? "none"}`}
        fitViewRequest={fitViewRequest}
        minViewportWidth={360}
        nodes={layout.nodes}
        nodeTypes={nodeTypes}
        elementsSelectable={false}
      />
    </MultiportVariableInspectProvider>
  );
}
