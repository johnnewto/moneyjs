import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent
} from "react";

const DEFAULT_DIVIDER_WIDTH_PX = 12;
const DEFAULT_KEYBOARD_STEP_PX = 40;

interface UsePanelSplitterOptions {
  defaultLeftWidthPercent: number;
  minLeftWidthPx: number;
  minRightWidthPx: number;
  keyboardStepPx?: number;
  dividerWidthPx?: number;
  storageKey?: string;
}

function getStoredLeftWidthPercent(storageKey: string | undefined, fallback: number) {
  if (!storageKey || typeof window === "undefined") {
    return fallback;
  }

  try {
    const storedValue = window.localStorage.getItem(storageKey);
    if (storedValue == null) {
      return fallback;
    }

    const parsedValue = Number.parseFloat(storedValue);
    if (!Number.isFinite(parsedValue)) {
      return fallback;
    }

    return Math.min(Math.max(parsedValue, 0), 100);
  } catch {
    return fallback;
  }
}

function clampLeftWidthPercent(
  nextPercent: number,
  containerWidth: number,
  minLeftWidthPx: number,
  minRightWidthPx: number,
  dividerWidthPx: number
) {
  const usableWidth = Math.max(containerWidth - dividerWidthPx, 1);
  const minPercent = (minLeftWidthPx / usableWidth) * 100;
  const maxPercent = 100 - (minRightWidthPx / usableWidth) * 100;

  if (maxPercent <= minPercent) {
    return 50;
  }

  return Math.min(Math.max(nextPercent, minPercent), maxPercent);
}

export function usePanelSplitter({
  defaultLeftWidthPercent,
  minLeftWidthPx,
  minRightWidthPx,
  keyboardStepPx = DEFAULT_KEYBOARD_STEP_PX,
  dividerWidthPx = DEFAULT_DIVIDER_WIDTH_PX,
  storageKey
}: UsePanelSplitterOptions) {
  const layoutRef = useRef<HTMLDivElement | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const [leftWidthPercent, setLeftWidthPercent] = useState(() =>
    getStoredLeftWidthPercent(storageKey, defaultLeftWidthPercent)
  );
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, []);

  useEffect(() => {
    const layout = layoutRef.current;
    if (!layout) {
      return;
    }

    layout.style.setProperty("--panel-left-width", `${leftWidthPercent}%`);
  }, [leftWidthPercent]);

  useEffect(() => {
    if (!storageKey || typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(storageKey, String(leftWidthPercent));
    } catch {
      // Ignore storage failures so the splitter still works in restricted environments.
    }
  }, [leftWidthPercent, storageKey]);

  const updateFromClientX = useCallback(
    (clientX: number) => {
      const layout = layoutRef.current;
      if (!layout) {
        return;
      }

      const bounds = layout.getBoundingClientRect();
      const nextPercent = ((clientX - bounds.left) / Math.max(bounds.width, 1)) * 100;
      setLeftWidthPercent((current) =>
        clampLeftWidthPercent(
          Number.isFinite(nextPercent) ? nextPercent : current,
          bounds.width,
          minLeftWidthPx,
          minRightWidthPx,
          dividerWidthPx
        )
      );
    },
    [dividerWidthPx, minLeftWidthPx, minRightWidthPx]
  );

  const onMouseDown = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      if (event.button !== 0) {
        return;
      }

      event.preventDefault();
      setIsDragging(true);
      document.body.classList.add("panel-splitter-body-lock");

      const handleMouseMove = (moveEvent: MouseEvent) => {
        moveEvent.preventDefault();
        updateFromClientX(moveEvent.clientX);
      };

      const finishDrag = () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", finishDrag);
        document.body.classList.remove("panel-splitter-body-lock");
        cleanupRef.current = null;
        setIsDragging(false);
      };

      cleanupRef.current = finishDrag;
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", finishDrag);
    },
    [updateFromClientX]
  );

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      const layout = layoutRef.current;
      if (!layout) {
        return;
      }

      const containerWidth = layout.getBoundingClientRect().width;
      const stepPercent = (keyboardStepPx / Math.max(containerWidth - dividerWidthPx, 1)) * 100;

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setLeftWidthPercent((current) =>
          clampLeftWidthPercent(
            current - stepPercent,
            containerWidth,
            minLeftWidthPx,
            minRightWidthPx,
            dividerWidthPx
          )
        );
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        setLeftWidthPercent((current) =>
          clampLeftWidthPercent(
            current + stepPercent,
            containerWidth,
            minLeftWidthPx,
            minRightWidthPx,
            dividerWidthPx
          )
        );
        return;
      }

      if (event.key === "Home") {
        event.preventDefault();
        setLeftWidthPercent(
          clampLeftWidthPercent(0, containerWidth, minLeftWidthPx, minRightWidthPx, dividerWidthPx)
        );
        return;
      }

      if (event.key === "End") {
        event.preventDefault();
        setLeftWidthPercent(
          clampLeftWidthPercent(100, containerWidth, minLeftWidthPx, minRightWidthPx, dividerWidthPx)
        );
      }
    },
    [dividerWidthPx, keyboardStepPx, minLeftWidthPx, minRightWidthPx]
  );

  return {
    layoutRef,
    splitterProps: {
      "aria-label": "Resize panels",
      "aria-orientation": "vertical" as const,
      "aria-valuemax": 100,
      "aria-valuemin": 0,
      "aria-valuenow": Math.round(leftWidthPercent),
      className: `panel-splitter${isDragging ? " is-active" : ""}`,
      onKeyDown,
      onMouseDown,
      role: "separator" as const,
      tabIndex: 0
    }
  };
}