import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent
} from "react";

export interface FloatingPanelSize {
  height: number;
  width: number;
}

const DEFAULT_SIZE: FloatingPanelSize = { width: 720, height: 480 };
const MIN_WIDTH_PX = 320;
const MIN_HEIGHT_PX = 200;
const VIEWPORT_MARGIN_PX = 16;

interface UseFloatingPanelSizeOptions {
  defaultSize?: FloatingPanelSize;
  minHeightPx?: number;
  minWidthPx?: number;
  position: { x: number; y: number };
  storageKey: string;
}

export function useFloatingPanelSize({
  defaultSize = DEFAULT_SIZE,
  minHeightPx = MIN_HEIGHT_PX,
  minWidthPx = MIN_WIDTH_PX,
  position,
  storageKey
}: UseFloatingPanelSizeOptions): {
  size: FloatingPanelSize;
  resizeHandleProps: {
    "aria-label": string;
    className: string;
    onMouseDown(event: ReactMouseEvent<HTMLElement>): void;
    role: "separator";
    tabIndex: 0;
  };
} {
  const [size, setSize] = useState<FloatingPanelSize>(() =>
    readStoredSize(storageKey, defaultSize)
  );
  const cleanupRef = useRef<(() => void) | null>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    originHeight: number;
    originWidth: number;
  } | null>(null);

  useEffect(() => {
    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, []);

  const clampSize = useCallback(
    (next: FloatingPanelSize): FloatingPanelSize => {
      const maxWidth = Math.max(
        minWidthPx,
        window.innerWidth - position.x - VIEWPORT_MARGIN_PX
      );
      const maxHeight = Math.max(
        minHeightPx,
        window.innerHeight - position.y - VIEWPORT_MARGIN_PX
      );

      return {
        width: Math.min(Math.max(next.width, minWidthPx), maxWidth),
        height: Math.min(Math.max(next.height, minHeightPx), maxHeight)
      };
    },
    [minHeightPx, minWidthPx, position.x, position.y]
  );

  const onMouseDown = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      if (event.button !== 0) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      dragRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        originWidth: size.width,
        originHeight: size.height
      };
      document.body.classList.add("floating-panel-resize-body-lock");

      const handleMouseMove = (moveEvent: MouseEvent) => {
        moveEvent.preventDefault();
        const drag = dragRef.current;
        if (!drag) {
          return;
        }

        setSize(
          clampSize({
            width: drag.originWidth + (moveEvent.clientX - drag.startX),
            height: drag.originHeight + (moveEvent.clientY - drag.startY)
          })
        );
      };

      const finishDrag = () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", finishDrag);
        document.body.classList.remove("floating-panel-resize-body-lock");
        dragRef.current = null;
        cleanupRef.current = null;
      };

      cleanupRef.current = finishDrag;
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", finishDrag);
    },
    [clampSize, size.height, size.width]
  );

  useEffect(() => {
    writeStoredSize(storageKey, size);
  }, [size, storageKey]);

  useEffect(() => {
    setSize((current) => clampSize(current));
  }, [clampSize]);

  return {
    size,
    resizeHandleProps: {
      "aria-label": "Resize pinned panel",
      className: "notebook-pinned-cell-panel-resize-handle",
      onMouseDown,
      role: "separator",
      tabIndex: 0
    }
  };
}

function readStoredSize(storageKey: string, fallback: FloatingPanelSize): FloatingPanelSize {
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) {
      return fallback;
    }

    const parsed = JSON.parse(raw) as Partial<FloatingPanelSize>;
    if (typeof parsed.width === "number" && typeof parsed.height === "number") {
      return {
        width: Math.max(parsed.width, MIN_WIDTH_PX),
        height: Math.max(parsed.height, MIN_HEIGHT_PX)
      };
    }
  } catch {
    // ignore
  }

  return fallback;
}

function writeStoredSize(storageKey: string, size: FloatingPanelSize): void {
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(size));
  } catch {
    // ignore quota / private mode
  }
}
