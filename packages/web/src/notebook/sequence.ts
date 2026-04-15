import {
  evaluateExpression,
  parseExpression,
  type SimulationResult
} from "@sfcr/core";

import type { MatrixCell, SequenceCell } from "./types";

export interface SequenceParticipant {
  id: string;
  label: string;
  order: number;
}

export type SequenceStep = SequenceMessageStep | SequenceNoteStep | SequenceDividerStep;

export interface SequenceMessageStep {
  type: "message";
  senderId: string;
  receiverId: string;
  label: string;
  lineStyle: "solid" | "dashed";
  color?: string;
  magnitude?: number;
}

export interface SequenceNoteStep {
  type: "note";
  position: "left" | "right" | "over";
  participantIds: string[];
  text: string;
}

export interface SequenceDividerStep {
  type: "divider";
  label: string;
}

export interface ParsedDiagram {
  participants: SequenceParticipant[];
  steps: SequenceStep[];
  errors: string[];
}

const AUTO_FLOW_COLORS = [
  "#65d3b1",
  "#94a3f5",
  "#ec9a3c",
  "#f26d7d",
  "#4f9ef8",
  "#7f9c45"
] as const;

const PARTICIPANT_KEYWORDS = new Set([
  "participant",
  "actor",
  "boundary",
  "control",
  "entity",
  "database",
  "collections"
]);

export function resolveSequenceDiagram(
  cell: SequenceCell,
  resolveMatrixCell: (cellId: string) => MatrixCell | null,
  resolveResult: (cellId: string) => SimulationResult | null,
  selectedPeriodIndex: number
): ParsedDiagram {
  if (cell.source.kind === "plantuml") {
    return parseSequencePlantUml(cell.source.source);
  }

  if (cell.source.kind !== "matrix") {
    return {
      participants: [],
      steps: [],
      errors: [`Unsupported sequence source kind '${cell.source.kind}'.`]
    };
  }

  const matrixCell = resolveMatrixCell(cell.source.matrixCellId);
  if (!matrixCell) {
    return {
      participants: [],
      steps: [],
      errors: [`Matrix cell '${cell.source.matrixCellId}' was not found.`]
    };
  }

  const runCellId = cell.source.sourceRunCellId ?? matrixCell.sourceRunCellId;
  const result = runCellId ? resolveResult(runCellId) : null;
  return buildSequenceDiagramFromMatrix(
    matrixCell,
    result,
    selectedPeriodIndex,
    cell.source.aliases,
    cell.source.includeZeroFlows ?? false
  );
}

export function parseSequencePlantUml(source: string): ParsedDiagram {
  const participantMap = new Map<string, SequenceParticipant>();
  const steps: SequenceStep[] = [];
  const errors: string[] = [];
  const lines = source.replace(/\r\n/g, "\n").split("\n");

  function ensureParticipant(id: string, label?: string): SequenceParticipant {
    const existing = participantMap.get(id);
    if (existing) {
      if (label && existing.label === existing.id) {
        existing.label = label;
      }
      return existing;
    }

    const participant = {
      id,
      label: label ?? id,
      order: participantMap.size
    };
    participantMap.set(id, participant);
    return participant;
  }

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line || line.startsWith("'") || line.startsWith("//")) {
      return;
    }
    if (line === "@startuml" || line === "@enduml") {
      return;
    }

    const participant = parseParticipantDeclaration(line);
    if (participant) {
      ensureParticipant(participant.id, participant.label);
      return;
    }

    const divider = line.match(/^==\s*(.+?)\s*==$/);
    if (divider) {
      steps.push({ type: "divider", label: divider[1] });
      return;
    }

    const note = parseNote(line);
    if (note) {
      note.participantIds.forEach((participantId) => ensureParticipant(participantId));
      steps.push(note);
      return;
    }

    const message = parseMessage(line);
    if (message) {
      ensureParticipant(message.senderId);
      ensureParticipant(message.receiverId);
      steps.push(message);
      return;
    }

    errors.push(`Line ${index + 1}: unsupported sequence syntax '${line}'.`);
  });

  return {
    participants: Array.from(participantMap.values()).sort((left, right) => left.order - right.order),
    steps,
    errors
  };
}

export function buildSequenceDiagramFromMatrix(
  cell: MatrixCell,
  result: SimulationResult | null,
  selectedPeriodIndex: number,
  aliases?: Record<string, string>,
  includeZeroFlows = false
): ParsedDiagram {
  const sumColumnIndex = findSumColumnIndex(cell.columns);
  const participants = cell.columns
    .map((column, index) => ({ column, index }))
    .filter(({ index }) => index !== sumColumnIndex)
    .map(({ column, index }) => ({
      id: column,
      label: aliases?.[column] ?? column,
      order: index
    }));

  const steps: SequenceStep[] = [];

  cell.rows.forEach((row, rowIndex) => {
    if (row.label.trim().toLowerCase() === "sum") {
      return;
    }

    const rowValues = row.values
      .map((value, columnIndex) => ({ value, columnIndex }))
      .filter(({ columnIndex }) => columnIndex !== sumColumnIndex)
      .map(({ value, columnIndex }) => ({
        participantId: cell.columns[columnIndex] ?? `column-${columnIndex}`,
        value: evaluateMatrixEntryNumber(value, result, selectedPeriodIndex),
        source: value,
        direction: inferMatrixDirection(value)
      }))
      .filter((entry) => entry.source.trim().length > 0);

    const negatives = rowValues.filter(
      (entry) =>
        entry.direction === -1 || (entry.value != null && entry.value < -1e-9)
    );
    const positives = rowValues.filter(
      (entry) =>
        entry.direction === 1 || (entry.value != null && entry.value > 1e-9)
    );
    const ambiguousEntries = rowValues.filter((entry) => entry.value == null);

    if (negatives.length === 1 && positives.length >= 1) {
      positives.forEach((positive, positiveIndex) => {
        const magnitude = positive.value ?? null;
        if (!includeZeroFlows && magnitude != null && Math.abs(magnitude) < 1e-9) {
          return;
        }
        steps.push({
          type: "message",
          senderId: negatives[0].participantId,
          receiverId: positive.participantId,
          label: formatAutoFlowLabel(row.label, magnitude),
          lineStyle: "solid",
          color: AUTO_FLOW_COLORS[(rowIndex + positiveIndex) % AUTO_FLOW_COLORS.length],
          magnitude: magnitude ?? undefined
        });
      });
      return;
    }

    if (positives.length === 1 && negatives.length >= 1) {
      negatives.forEach((negative, negativeIndex) => {
        const magnitude = negative.value == null ? null : Math.abs(negative.value);
        if (!includeZeroFlows && magnitude != null && Math.abs(magnitude) < 1e-9) {
          return;
        }
        steps.push({
          type: "message",
          senderId: negative.participantId,
          receiverId: positives[0].participantId,
          label: formatAutoFlowLabel(row.label, magnitude),
          lineStyle: "solid",
          color: AUTO_FLOW_COLORS[(rowIndex + negativeIndex) % AUTO_FLOW_COLORS.length],
          magnitude: magnitude ?? undefined
        });
      });
      return;
    }

    if (negatives.length === 1 && positives.length === 1) {
      const magnitude = positives[0].value ?? Math.abs(negatives[0].value ?? 0);
      if (!includeZeroFlows && magnitude != null && Math.abs(magnitude) < 1e-9) {
        return;
      }
      steps.push({
        type: "message",
        senderId: negatives[0].participantId,
        receiverId: positives[0].participantId,
        label: formatAutoFlowLabel(row.label, magnitude),
        lineStyle: "solid",
        color: AUTO_FLOW_COLORS[rowIndex % AUTO_FLOW_COLORS.length],
        magnitude: magnitude ?? undefined
      });
      return;
    }

    if (rowValues.length > 0) {
      const noteParts = [
        "Unable to infer a single directed flow",
        row.label,
        ambiguousEntries.length > 0 ? "missing runtime values" : null
      ]
        .filter(Boolean)
        .join(": ");
      const relatedParticipants = rowValues.map((entry) => entry.participantId);
      steps.push({
        type: "note",
        position: "over",
        participantIds: relatedParticipants.slice(0, 2),
        text: noteParts
      });
    }
  });

  return {
    participants,
    steps,
    errors: []
  };
}

function parseParticipantDeclaration(
  line: string
): { id: string; label: string } | null {
  const keyword = line.split(/\s+/, 1)[0]?.toLowerCase();
  if (!keyword || !PARTICIPANT_KEYWORDS.has(keyword)) {
    return null;
  }

  const body = line.slice(keyword.length).trim();
  if (!body) {
    return null;
  }

  const quotedMatch = body.match(/^"([^"]+)"(?:\s+as\s+([A-Za-z0-9_.-]+))?$/);
  if (quotedMatch) {
    return {
      id: quotedMatch[2] ?? sanitizeIdentifier(quotedMatch[1]),
      label: quotedMatch[1]
    };
  }

  const aliasMatch = body.match(/^([A-Za-z0-9_.-]+)(?:\s+as\s+([A-Za-z0-9_.-]+))?$/);
  if (!aliasMatch) {
    return null;
  }

  return {
    id: aliasMatch[2] ?? aliasMatch[1],
    label: aliasMatch[1]
  };
}

function parseMessage(line: string): SequenceMessageStep | null {
  const match = line.match(
    /^([A-Za-z0-9_.-]+)\s*(->|-->|<-|<--)\s*([A-Za-z0-9_.-]+)\s*(?::\s*(.+))?$/
  );
  if (!match) {
    return null;
  }

  const [, leftId, arrow, rightId, label] = match;
  const isLeftArrow = arrow.startsWith("<");
  return {
    type: "message",
    senderId: isLeftArrow ? rightId : leftId,
    receiverId: isLeftArrow ? leftId : rightId,
    label: label?.trim() ?? "",
    lineStyle: arrow.includes("--") ? "dashed" : "solid"
  };
}

function parseNote(line: string): SequenceNoteStep | null {
  const match = line.match(
    /^note\s+(left of|right of|over)\s+([A-Za-z0-9_.-]+)(?:\s*,\s*([A-Za-z0-9_.-]+))?\s*:\s*(.+)$/i
  );
  if (!match) {
    return null;
  }

  const [, rawPosition, participantA, participantB, text] = match;
  return {
    type: "note",
    position: rawPosition.toLowerCase().includes("left")
      ? "left"
      : rawPosition.toLowerCase().includes("right")
        ? "right"
        : "over",
    participantIds: [participantA, participantB].filter(
      (participantId): participantId is string => Boolean(participantId)
    ),
    text: text.trim()
  };
}

function sanitizeIdentifier(label: string): string {
  return label.replace(/[^A-Za-z0-9_.-]+/g, "_");
}

function findSumColumnIndex(columns: string[]): number {
  return columns.findIndex((column) => column.trim().toLowerCase() === "sum");
}

function formatAutoFlowLabel(label: string, value: number | null): string {
  if (value == null || !Number.isFinite(value)) {
    return label;
  }
  return `${label} (${formatMatrixNumber(value)})`;
}

function inferMatrixDirection(source: string): -1 | 0 | 1 | null {
  const normalized = source.trim();
  if (!normalized) {
    return null;
  }
  if (normalized === "0") {
    return 0;
  }
  if (normalized.startsWith("+")) {
    return 1;
  }
  if (normalized.startsWith("-")) {
    return -1;
  }
  const numeric = Number(normalized);
  if (Number.isFinite(numeric)) {
    if (numeric > 0) {
      return 1;
    }
    if (numeric < 0) {
      return -1;
    }
    return 0;
  }
  return null;
}

function evaluateMatrixEntryNumber(
  source: string,
  result: SimulationResult | null,
  selectedPeriodIndex: number
): number | null {
  const normalizedSource = source.trim();
  if (!normalizedSource || !result) {
    return null;
  }

  try {
    const expression = parseExpression(stripLeadingPlus(normalizedSource));
    const value = evaluateExpression(expression, createResultContext(result, selectedPeriodIndex));
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function stripLeadingPlus(source: string): string {
  return source.startsWith("+") ? source.slice(1).trimStart() : source;
}

function createResultContext(result: SimulationResult, selectedPeriodIndex: number) {
  return {
    currentValue(variable: string): number {
      const values = result.series[variable];
      if (values) {
        const index = Math.min(selectedPeriodIndex, Math.max(values.length - 1, 0));
        return values[index] ?? NaN;
      }
      return externalValueAt(result, variable, selectedPeriodIndex);
    },
    lagValue(variable: string): number {
      const values = result.series[variable];
      if (values) {
        const index = Math.max(Math.min(selectedPeriodIndex, values.length - 1) - 1, 0);
        return values[index] ?? NaN;
      }
      return externalValueAt(result, variable, Math.max(selectedPeriodIndex - 1, 0));
    },
    diffValue(variable: string): number {
      return this.currentValue(variable) - this.lagValue(variable);
    },
    setCurrentValue(): void {},
    hasSeries(variable: string): boolean {
      return variable in result.series;
    }
  };
}

function externalValueAt(
  result: SimulationResult,
  variable: string,
  periodIndex: number
): number {
  const external = result.model.externals[variable];
  if (!external) {
    return NaN;
  }
  if (external.kind === "constant") {
    return external.value;
  }
  const index = Math.min(periodIndex, Math.max(external.values.length - 1, 0));
  return external.values[index] ?? NaN;
}

function formatMatrixNumber(value: number): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}
