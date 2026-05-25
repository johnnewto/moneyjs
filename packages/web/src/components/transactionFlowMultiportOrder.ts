import type { ParsedDiagram } from "../notebook/sequence";

import { MULTIPORT_START_X, MULTIPORT_X_GAP } from "./transactionFlowMultiportLayout";

export function defaultParticipantColumnOrder(diagram: ParsedDiagram): string[] {
  return diagram.participants.map((participant) => participant.id);
}

export function sanitizeParticipantColumnOrder(
  participantIds: string[],
  storedOrder?: string[] | null
): string[] {
  if (!storedOrder?.length) {
    return [...participantIds];
  }

  const idSet = new Set(participantIds);
  const seen = new Set<string>();
  const next = storedOrder.filter((id) => {
    if (!idSet.has(id) || seen.has(id)) {
      return false;
    }
    seen.add(id);
    return true;
  });
  participantIds.forEach((id) => {
    if (!seen.has(id)) {
      next.push(id);
      seen.add(id);
    }
  });
  return next;
}

export function applyParticipantColumnOrder(
  diagram: ParsedDiagram,
  columnOrder: string[]
): ParsedDiagram {
  const orderById = new Map(columnOrder.map((id, index) => [id, index]));
  return {
    ...diagram,
    participants: diagram.participants
      .map((participant) => ({
        ...participant,
        order: orderById.get(participant.id) ?? participant.order
      }))
      .sort((left, right) => left.order - right.order)
  };
}

export function slotFromMultiportX(x: number, participantCount: number): number {
  if (participantCount <= 0) {
    return 0;
  }
  const raw = Math.round((x - MULTIPORT_START_X) / MULTIPORT_X_GAP);
  return Math.max(0, Math.min(raw, participantCount - 1));
}

export function multiportXFromSlot(slot: number): number {
  return MULTIPORT_START_X + slot * MULTIPORT_X_GAP;
}

export function reorderParticipantIds(
  order: string[],
  draggedId: string,
  targetSlot: number
): string[] {
  if (!order.includes(draggedId)) {
    return [...order];
  }
  const next = order.filter((id) => id !== draggedId);
  const clamped = Math.max(0, Math.min(targetSlot, next.length));
  next.splice(clamped, 0, draggedId);
  return next;
}
