import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

export interface FloatingPanelPosition {
  x: number;
  y: number;
}

const DEFAULT_POSITION: FloatingPanelPosition = { x: 48, y: 72 };

export function useFloatingPanelPosition(storageKey: string): {
  position: FloatingPanelPosition;
  dragHandleProps: {
    onPointerDown(event: ReactPointerEvent<HTMLElement>): void;
  };
} {
  const [position, setPosition] = useState<FloatingPanelPosition>(() => readStoredPosition(storageKey));
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) {
      return;
    }

    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y
    };
    event.preventDefault();
  }, [position.x, position.y]);

  useEffect(() => {
    function handlePointerMove(event: PointerEvent): void {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) {
        return;
      }

      setPosition({
        x: Math.max(8, drag.originX + (event.clientX - drag.startX)),
        y: Math.max(8, drag.originY + (event.clientY - drag.startY))
      });
    }

    function handlePointerUp(event: PointerEvent): void {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) {
        return;
      }

      dragRef.current = null;
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, []);

  useEffect(() => {
    writeStoredPosition(storageKey, position);
  }, [position, storageKey]);

  return {
    position,
    dragHandleProps: { onPointerDown }
  };
}

function readStoredPosition(storageKey: string): FloatingPanelPosition {
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) {
      return DEFAULT_POSITION;
    }

    const parsed = JSON.parse(raw) as Partial<FloatingPanelPosition>;
    if (typeof parsed.x === "number" && typeof parsed.y === "number") {
      return { x: parsed.x, y: parsed.y };
    }
  } catch {
    // ignore
  }

  return DEFAULT_POSITION;
}

function writeStoredPosition(storageKey: string, position: FloatingPanelPosition): void {
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(position));
  } catch {
    // ignore quota / private mode
  }
}
