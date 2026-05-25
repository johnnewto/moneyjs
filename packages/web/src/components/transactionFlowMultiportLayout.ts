import { MarkerType, type Edge, type Node } from "@xyflow/react";

import type { MultiportParticipantStock } from "./multiportParticipantStocks";
import type {
  ParsedDiagram,
  SequenceMessageStep,
  SequenceNoteStep,
  SequenceStep
} from "../notebook/sequence";

export const MULTIPORT_NODE_WIDTH = 210;
export const MULTIPORT_NODE_MIN_HEIGHT = 420;
export const MULTIPORT_X_GAP = 255;
export const MULTIPORT_START_X = 56;
export const MULTIPORT_START_Y = 36;
export const MULTIPORT_ROW_TOP = 92;
export const MULTIPORT_ROW_GAP = 68;
export const MULTIPORT_ROW_HEIGHT = 54;
export const MULTIPORT_STOCK_ROW_HEIGHT = 26;
export const MULTIPORT_STOCK_FOOTER_GAP = 10;
export type MultiportSide = "left" | "right";
export type MultiportFlowClass = "real" | "capital" | "financial";

export interface MatrixMultiportPort {
  rowIndex: number;
  rowLabel: string;
  entry: string;
  expression: string;
  sign: -1 | 0 | 1;
  sides: MultiportSide[];
  highlighted: boolean;
}

export interface MatrixMultiportNodeData {
  label: string;
  order: number;
  ports: MatrixMultiportPort[];
  stocks: MultiportParticipantStock[];
}

export interface MatrixMultiportNoteNodeData {
  text: string;
  rowIndex: number;
}

export interface MatrixMultiportEdgeData {
  flowClass: MultiportFlowClass;
  highlighted: boolean;
  rowIndex: number;
}

export interface TransactionFlowMultiportLayout {
  nodes: Node[];
  edges: Edge[];
  width: number;
  height: number;
}

interface MultiportTransaction {
  id: string;
  step: SequenceMessageStep;
  stepIndex: number;
  rowIndex: number;
  sourceOrder: number;
  targetOrder: number;
  sourceSide: MultiportSide;
  targetSide: MultiportSide;
  sourceHandle: string;
  targetHandle: string;
  flowClass: MultiportFlowClass;
  highlighted: boolean;
}

export function buildTransactionFlowMultiportLayout(
  diagram: ParsedDiagram,
  visibleStepCount: number,
  highlightedStepIndex: number | null,
  animateEdges = false,
  participantStocks: Map<string, MultiportParticipantStock[]> = new Map()
): TransactionFlowMultiportLayout {
  const visibleSteps = diagram.steps.slice(
    0,
    Math.max(0, Math.min(visibleStepCount, diagram.steps.length))
  );
  const rowIndices = collectRowIndices(visibleSteps.length > 0 ? visibleSteps : diagram.steps);
  const maxRowIndex = rowIndices.length > 0 ? Math.max(...rowIndices) : 0;
  const maxStockCount = Math.max(
    0,
    ...diagram.participants.map(
      (participant) => participantStocks.get(participant.id)?.length ?? 0
    )
  );
  const stockFooterHeight =
    maxStockCount > 0
      ? MULTIPORT_STOCK_FOOTER_GAP + maxStockCount * MULTIPORT_STOCK_ROW_HEIGHT + 8
      : 0;
  const nodeHeight = Math.max(
    MULTIPORT_NODE_MIN_HEIGHT,
    MULTIPORT_ROW_TOP + (maxRowIndex + 1) * MULTIPORT_ROW_GAP + stockFooterHeight + 28
  );
  const participantOrderById = new Map(
    diagram.participants.map((participant) => [participant.id, participant.order])
  );
  const rowLabelByIndex = buildRowLabelByIndex(diagram.steps);
  const transactions = visibleSteps.flatMap((step, stepIndex) => {
    if (step.type !== "message") {
      return [];
    }
    const sourceOrder = participantOrderById.get(step.senderId);
    const targetOrder = participantOrderById.get(step.receiverId);
    if (sourceOrder == null || targetOrder == null) {
      return [];
    }
    const rowIndex = step.rowIndex ?? stepIndex;
    const sourceIsLeft = sourceOrder < targetOrder;
    const sourceSide = sourceIsLeft ? "right" : "left";
    const targetSide = sourceIsLeft ? "left" : "right";
    return [
      {
        id: `multiport-flow-${stepIndex}-${step.senderId}-${step.receiverId}`,
        step,
        stepIndex,
        rowIndex,
        sourceOrder,
        targetOrder,
        sourceSide,
        targetSide,
        sourceHandle: handleId(sourceSide, rowIndex),
        targetHandle: handleId(targetSide, rowIndex),
        flowClass: classifyFlow(step.label),
        highlighted: highlightedStepIndex === stepIndex
      } satisfies MultiportTransaction
    ];
  });

  const transactionsByParticipantAndRow = new Map<string, MultiportTransaction[]>();
  transactions.forEach((transaction) => {
    addParticipantRowTransaction(transactionsByParticipantAndRow, transaction.step.senderId, transaction);
    addParticipantRowTransaction(transactionsByParticipantAndRow, transaction.step.receiverId, transaction);
  });

  const nodes: Node[] = diagram.participants.map((participant) => ({
    id: participant.id,
    type: "matrixMultiport",
    position: {
      x: MULTIPORT_START_X + participant.order * MULTIPORT_X_GAP,
      y: MULTIPORT_START_Y
    },
    data: {
      label: participant.label,
      order: participant.order,
      stocks: participantStocks.get(participant.id) ?? [],
      ports: rowIndices.map((rowIndex) => {
        const participantTransactions =
          transactionsByParticipantAndRow.get(participantRowKey(participant.id, rowIndex)) ?? [];
        const entry = entryForParticipant(participantTransactions[0]?.step, participant.id);
        const sign = inferEntrySign(entry);
        const sides = Array.from(
          new Set(
            participantTransactions.map((transaction) =>
              transaction.step.senderId === participant.id
                ? transaction.sourceSide
                : transaction.targetSide
            )
          )
        );
        return {
          rowIndex,
          rowLabel: rowLabelByIndex.get(rowIndex) ?? `Row ${rowIndex + 1}`,
          entry,
          expression: stripLeadingSign(entry),
          sign,
          sides,
          highlighted: participantTransactions.some((transaction) => transaction.highlighted)
        } satisfies MatrixMultiportPort;
      })
    } satisfies MatrixMultiportNodeData,
    draggable: false,
    selectable: false,
    width: MULTIPORT_NODE_WIDTH,
    height: nodeHeight,
    zIndex: 2
  }));

  const noteNodes: Node[] = visibleSteps.flatMap((step, stepIndex) => {
    if (step.type !== "note") {
      return [];
    }
    const rowIndex = step.rowIndex ?? stepIndex;
    return [
      {
        id: `multiport-note-${stepIndex}`,
        type: "matrixMultiportNote",
        position: {
          x: MULTIPORT_START_X,
          y: MULTIPORT_START_Y + MULTIPORT_ROW_TOP + rowIndex * MULTIPORT_ROW_GAP - 8
        },
        data: {
          text: formatNoteText(step),
          rowIndex
        } satisfies MatrixMultiportNoteNodeData,
        draggable: false,
        selectable: false,
        zIndex: 3
      }
    ];
  });

  const edges: Edge[] = transactions.map((transaction) => ({
    id: transaction.id,
    source: transaction.step.senderId,
    target: transaction.step.receiverId,
    sourceHandle: transaction.sourceHandle,
    targetHandle: transaction.targetHandle,
    type: "smoothstep",
    animated: animateEdges,
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: transaction.highlighted ? 20 : 16,
      height: transaction.highlighted ? 20 : 16,
      color: edgeColor(transaction.flowClass, transaction.highlighted)
    },
    className: [
      "multiport-flow-edge",
      `multiport-flow-edge--${transaction.flowClass}`,
      transaction.highlighted ? "is-highlighted" : ""
    ]
      .filter(Boolean)
      .join(" "),
    style: {
      stroke: edgeColor(transaction.flowClass, transaction.highlighted),
      strokeWidth: transaction.highlighted ? 3.5 : transaction.flowClass === "financial" ? 3 : 2.5,
      strokeDasharray: transaction.flowClass === "capital" ? "8 5" : undefined
    },
    data: {
      flowClass: transaction.flowClass,
      highlighted: transaction.highlighted,
      rowIndex: transaction.rowIndex
    } satisfies MatrixMultiportEdgeData,
    selectable: false,
    zIndex: transaction.highlighted ? 5 : 4
  }));

  const width =
    MULTIPORT_START_X * 2 +
    Math.max(0, diagram.participants.length - 1) * MULTIPORT_X_GAP +
    MULTIPORT_NODE_WIDTH;
  const height = MULTIPORT_START_Y * 2 + nodeHeight;

  return {
    nodes: [...nodes, ...noteNodes],
    edges,
    width,
    height
  };
}

export function handleId(side: MultiportSide, rowIndex: number): string {
  return `${side}-${rowIndex}`;
}

function collectRowIndices(steps: SequenceStep[]): number[] {
  const indices = new Set<number>();
  steps.forEach((step, stepIndex) => {
    if (step.type === "message" || step.type === "note") {
      indices.add(step.rowIndex ?? stepIndex);
    }
  });
  return Array.from(indices.values()).sort((left, right) => left - right);
}

function buildRowLabelByIndex(steps: SequenceStep[]): Map<number, string> {
  const labels = new Map<number, string>();
  steps.forEach((step, stepIndex) => {
    const rowIndex = step.type === "message" || step.type === "note" ? step.rowIndex ?? stepIndex : stepIndex;
    if (labels.has(rowIndex)) {
      return;
    }
    if (step.type === "message") {
      labels.set(rowIndex, stripFlowAmountSuffix(step.label));
    } else if (step.type === "note") {
      labels.set(rowIndex, step.text);
    }
  });
  return labels;
}

function participantRowKey(participantId: string, rowIndex: number): string {
  return `${participantId}:${rowIndex}`;
}

function addParticipantRowTransaction(
  transactionsByParticipantAndRow: Map<string, MultiportTransaction[]>,
  participantId: string,
  transaction: MultiportTransaction
): void {
  const key = participantRowKey(participantId, transaction.rowIndex);
  const existing = transactionsByParticipantAndRow.get(key);
  if (existing) {
    existing.push(transaction);
    return;
  }
  transactionsByParticipantAndRow.set(key, [transaction]);
}

function entryForParticipant(step: SequenceMessageStep | undefined, participantId: string): string {
  if (!step) {
    return "";
  }
  if (step.senderId === participantId) {
    return step.sourceExpression ?? "";
  }
  if (step.receiverId === participantId) {
    return step.targetExpression ?? "";
  }
  return "";
}

function inferEntrySign(entry: string): -1 | 0 | 1 {
  const trimmed = entry.trim();
  if (trimmed.startsWith("-")) {
    return -1;
  }
  if (trimmed.startsWith("+")) {
    return 1;
  }
  return 0;
}

function stripLeadingSign(entry: string): string {
  return entry.trim().replace(/^[+-]\s*/, "");
}

function stripFlowAmountSuffix(label: string): string {
  return label.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

function classifyFlow(label: string): MultiportFlowClass {
  if (/interest|loans?|deposits?/i.test(label)) {
    return "financial";
  }
  if (/investment|depreciation|capital/i.test(label)) {
    return "capital";
  }
  return "real";
}

function edgeColor(flowClass: MultiportFlowClass, highlighted: boolean): string {
  if (highlighted) {
    return "#0f172a";
  }
  if (flowClass === "financial") {
    return "#7e22ce";
  }
  if (flowClass === "capital") {
    return "#b45309";
  }
  return "#2563eb";
}

function formatNoteText(step: SequenceNoteStep): string {
  return step.text;
}
