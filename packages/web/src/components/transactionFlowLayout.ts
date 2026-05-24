import type { Edge, Node } from "@xyflow/react";

import type {
  ParsedDiagram,
  SequenceMessageStep,
  SequenceNoteStep,
  SequenceStep
} from "../notebook/sequence";

export const TRANSACTION_FLOW_COLUMN_WIDTH = 190;
export const TRANSACTION_FLOW_LEFT_MARGIN = 120;
export const TRANSACTION_FLOW_TOP_MARGIN = 105;
export const TRANSACTION_FLOW_ROW_HEIGHT = 72;
export const TRANSACTION_FLOW_COLUMN_NODE_WIDTH = 144;
export const TRANSACTION_FLOW_COLUMN_NODE_HEIGHT = 58;

export interface MatrixFlowEdgeData {
  stepIndex: number;
  rowIndex: number;
  flowLabel: string;
  sourceExpression?: string;
  targetExpression?: string;
  color: string;
  lineStyle: "solid" | "dashed";
  magnitude?: number;
  strokeWidth: number;
  highlighted: boolean;
  laneOffset: number;
  rowY: number;
  sourceX: number;
  targetX: number;
}

export interface MatrixNoteNodeData {
  text: string;
  rowIndex: number;
}

export interface MatrixColumnNodeData {
  label: string;
}

export interface MatrixRowLaneNodeData {
  rowIndex: number;
  rowLabel?: string;
  laneWidth: number;
}

export interface TransactionFlowLayout {
  nodes: Node[];
  edges: Edge[];
  width: number;
  height: number;
  maxMagnitude: number;
}

export function buildTransactionFlowLayout(
  diagram: ParsedDiagram,
  visibleStepCount: number,
  highlightedStepIndex: number | null
): TransactionFlowLayout {
  const visibleSteps = diagram.steps.slice(
    0,
    Math.max(0, Math.min(visibleStepCount, diagram.steps.length))
  );
  const rowIndices = collectRowIndices(visibleSteps.length > 0 ? visibleSteps : diagram.steps);
  const maxRowIndex = rowIndices.length > 0 ? Math.max(...rowIndices) : 0;
  const participantCount = Math.max(diagram.participants.length, 1);
  const width =
    TRANSACTION_FLOW_LEFT_MARGIN * 2 +
    Math.max(0, participantCount - 1) * TRANSACTION_FLOW_COLUMN_WIDTH;
  const rowLabelByIndex = buildRowLabelByIndex(diagram.steps);

  const columnCenterById = new Map(
    diagram.participants.map((participant) => [
      participant.id,
      columnCenterX(participant.order)
    ])
  );

  const columnNodes: Node[] = diagram.participants.map((participant) => ({
    id: participant.id,
    type: "matrixColumn",
    position: {
      x: TRANSACTION_FLOW_LEFT_MARGIN + participant.order * TRANSACTION_FLOW_COLUMN_WIDTH,
      y: 20
    },
    data: { label: participant.label } satisfies MatrixColumnNodeData,
    draggable: false,
    selectable: false,
    width: TRANSACTION_FLOW_COLUMN_NODE_WIDTH,
    height: TRANSACTION_FLOW_COLUMN_NODE_HEIGHT
  }));

  const rowLaneNodes: Node[] = rowIndices.map((rowIndex) => ({
    id: `row-lane-${rowIndex}`,
    type: "matrixRowLane",
    position: {
      x: 0,
      y: rowYForIndex(rowIndex)
    },
    data: {
      rowIndex,
      rowLabel: rowLabelByIndex.get(rowIndex),
      laneWidth: width
    } satisfies MatrixRowLaneNodeData,
    width,
    height: TRANSACTION_FLOW_ROW_HEIGHT,
    draggable: false,
    selectable: false,
    zIndex: 0
  }));

  const laneCounts = new Map<string, number>();
  const messageSteps = visibleSteps.filter(
    (step): step is SequenceMessageStep => step.type === "message"
  );
  const maxMagnitude = messageSteps.reduce((currentMax, step) => {
    if (step.magnitude == null || !Number.isFinite(step.magnitude)) {
      return currentMax;
    }
    return Math.max(currentMax, Math.abs(step.magnitude));
  }, 0);

  const edges: Edge[] = [];
  visibleSteps.forEach((step, stepIndex) => {
    if (step.type === "message") {
      const rowIndex = step.rowIndex ?? stepIndex;
      const laneKey = `${rowIndex}:${step.senderId}:${step.receiverId}`;
      const laneOffset = laneCounts.get(laneKey) ?? 0;
      laneCounts.set(laneKey, laneOffset + 1);
      const sourceX = columnCenterById.get(step.senderId);
      const targetX = columnCenterById.get(step.receiverId);
      if (sourceX == null || targetX == null) {
        return;
      }
      edges.push({
        id: `flow-${stepIndex}-${step.senderId}-${step.receiverId}`,
        type: "matrixFlow",
        source: step.senderId,
        target: step.receiverId,
        data: {
          stepIndex,
          rowIndex,
          flowLabel: step.label,
          sourceExpression: step.sourceExpression,
          targetExpression: step.targetExpression,
          color: step.color ?? "#334155",
          lineStyle: step.lineStyle,
          magnitude: step.magnitude,
          strokeWidth: computeFlowStrokeWidth(step.magnitude, maxMagnitude),
          highlighted: highlightedStepIndex === stepIndex,
          laneOffset,
          rowY: rowYForIndex(rowIndex),
          sourceX,
          targetX
        } satisfies MatrixFlowEdgeData,
        selectable: false,
        zIndex: 2
      });
      return;
    }

  });

  const noteNodes: Node[] = visibleSteps.flatMap((step, stepIndex) => {
    if (step.type !== "note") {
      return [];
    }
    const rowIndex = step.rowIndex ?? stepIndex;
    const span = spanForParticipants(diagram, step.participantIds);
    return [
      {
        id: `note-${stepIndex}`,
        type: "matrixNote",
        position: {
          x: span.left,
          y: rowYForIndex(rowIndex) - 18
        },
        data: { text: step.text, rowIndex } satisfies MatrixNoteNodeData,
        draggable: false,
        selectable: false,
        zIndex: 3
      }
    ];
  });

  const height = TRANSACTION_FLOW_TOP_MARGIN + (maxRowIndex + 1) * TRANSACTION_FLOW_ROW_HEIGHT + 70;

  return {
    nodes: [...rowLaneNodes, ...columnNodes, ...noteNodes],
    edges,
    width,
    height,
    maxMagnitude
  };
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

function rowYForIndex(rowIndex: number): number {
  return TRANSACTION_FLOW_TOP_MARGIN + rowIndex * TRANSACTION_FLOW_ROW_HEIGHT;
}

function columnCenterX(participantOrder: number): number {
  const nodeX = TRANSACTION_FLOW_LEFT_MARGIN + participantOrder * TRANSACTION_FLOW_COLUMN_WIDTH;
  return nodeX + TRANSACTION_FLOW_COLUMN_NODE_WIDTH / 2;
}

function buildRowLabelByIndex(steps: SequenceStep[]): Map<number, string> {
  const labels = new Map<number, string>();

  steps.forEach((step, stepIndex) => {
    const rowIndex = step.rowIndex ?? stepIndex;
    if (labels.has(rowIndex)) {
      return;
    }

    if (step.type === "message") {
      labels.set(rowIndex, stripFlowAmountSuffix(step.label));
      return;
    }

    if (step.type === "note") {
      labels.set(rowIndex, step.text);
    }
  });

  return labels;
}

function stripFlowAmountSuffix(label: string): string {
  return label.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

function spanForParticipants(
  diagram: ParsedDiagram,
  participantIds: string[]
): { left: number; width: number } {
  const orders = participantIds
    .map((id) => diagram.participants.find((participant) => participant.id === id)?.order)
    .filter((order): order is number => order != null);
  if (orders.length === 0) {
    return { left: TRANSACTION_FLOW_LEFT_MARGIN - 60, width: 200 };
  }
  const minOrder = Math.min(...orders);
  const maxOrder = Math.max(...orders);
  const left = TRANSACTION_FLOW_LEFT_MARGIN + minOrder * TRANSACTION_FLOW_COLUMN_WIDTH - 72;
  const right = TRANSACTION_FLOW_LEFT_MARGIN + maxOrder * TRANSACTION_FLOW_COLUMN_WIDTH + 72;
  return { left, width: Math.max(160, right - left) };
}

const FLOW_STROKE_MIN = 2.5;
const FLOW_STROKE_MAX = 9;
export const FLOW_ARROW_MARKER_MIN = 8;
export const FLOW_ARROW_MARKER_STROKE_FACTOR = 4;

/** Log-scaled line weight so dominant flows read thicker without huge arrows (markers are fixed size). */
export function computeFlowStrokeWidth(magnitude: number | undefined, maxMagnitude: number): number {
  if (magnitude == null || !Number.isFinite(magnitude) || maxMagnitude <= 0) {
    return FLOW_STROKE_MIN;
  }
  const normalized = Math.min(
    1,
    Math.log1p(Math.abs(magnitude)) / Math.log1p(maxMagnitude)
  );
  return FLOW_STROKE_MIN + normalized * (FLOW_STROKE_MAX - FLOW_STROKE_MIN);
}

export function computeFlowArrowMarkerSize(strokeWidth: number): number {
  return Math.max(FLOW_ARROW_MARKER_MIN, FLOW_ARROW_MARKER_STROKE_FACTOR * strokeWidth);
}
