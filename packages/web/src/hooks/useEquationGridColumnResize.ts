import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";

export const EQUATION_GRID_VARIABLE_WIDTH_STORAGE_KEY = {
  embedded: "sfcr.equation-grid.variable-column-px.embedded",
  workspace: "sfcr.equation-grid.variable-column-px"
} as const;

const DEFAULT_VARIABLE_WIDTH_PX = {
  embedded: 160,
  workspace: 140
} as const;

const MIN_VARIABLE_WIDTH_PX = {
  embedded: 120,
  workspace: 110
} as const;

const MAX_VARIABLE_WIDTH_PX = {
  embedded: 280,
  workspace: 240
} as const;

const MIN_EXPRESSION_WIDTH_PX = 160;
const KEYBOARD_STEP_PX = 8;
const RESIZE_HANDLE_HALF_WIDTH_PX = 6;

interface UseEquationGridColumnResizeOptions {
  isEmbedded?: boolean;
}

function getStoredVariableWidthPx(storageKey: string, fallback: number) {
  if (typeof window === "undefined") {
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

    return parsedValue;
  } catch {
    return fallback;
  }
}

function clampVariableWidthPx(nextWidth: number, minWidthPx: number, maxWidthPx: number) {
  return Math.min(Math.max(nextWidth, minWidthPx), maxWidthPx);
}

function getMaxVariableWidthPx(
  shellWidth: number,
  minWidthPx: number,
  staticMaxWidthPx: number
) {
  if (shellWidth < 320) {
    return staticMaxWidthPx;
  }

  const reservedWidthPx =
    18 +
    72 +
    120 +
    34 +
    28 +
    0.32 * 6 * 16 +
    0.24 * 2 * 16 +
    MIN_EXPRESSION_WIDTH_PX;

  return Math.max(minWidthPx, shellWidth - reservedWidthPx);
}

export function useEquationGridColumnResize({
  isEmbedded = false
}: UseEquationGridColumnResizeOptions = {}) {
  const storageKey = isEmbedded
    ? EQUATION_GRID_VARIABLE_WIDTH_STORAGE_KEY.embedded
    : EQUATION_GRID_VARIABLE_WIDTH_STORAGE_KEY.workspace;
  const defaultWidthPx = isEmbedded
    ? DEFAULT_VARIABLE_WIDTH_PX.embedded
    : DEFAULT_VARIABLE_WIDTH_PX.workspace;
  const minWidthPx = isEmbedded ? MIN_VARIABLE_WIDTH_PX.embedded : MIN_VARIABLE_WIDTH_PX.workspace;
  const staticMaxWidthPx = isEmbedded
    ? MAX_VARIABLE_WIDTH_PX.embedded
    : MAX_VARIABLE_WIDTH_PX.workspace;

  const shellRef = useRef<HTMLDivElement | null>(null);
  const variableHeaderRef = useRef<HTMLSpanElement | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const dragStateRef = useRef<{ startWidthPx: number; startClientX: number } | null>(null);
  const [variableWidthPx, setVariableWidthPx] = useState(() =>
    getStoredVariableWidthPx(storageKey, defaultWidthPx)
  );
  const [handleLeftPx, setHandleLeftPx] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [maxWidthPx, setMaxWidthPx] = useState(staticMaxWidthPx);

  const updateHandlePosition = useCallback(() => {
    const headerCell = variableHeaderRef.current;
    const shell = shellRef.current;
    if (!headerCell || !shell) {
      return;
    }

    const headerRect = headerCell.getBoundingClientRect();
    const shellRect = shell.getBoundingClientRect();
    setHandleLeftPx(headerRect.right - shellRect.left - RESIZE_HANDLE_HALF_WIDTH_PX);
  }, []);

  const updateMaxWidth = useCallback(() => {
    const shell = shellRef.current;
    if (!shell) {
      setMaxWidthPx(staticMaxWidthPx);
      return;
    }

    const shellWidth = shell.getBoundingClientRect().width;
    setMaxWidthPx(
      Math.min(
        staticMaxWidthPx,
        getMaxVariableWidthPx(shellWidth, minWidthPx, staticMaxWidthPx)
      )
    );
  }, [minWidthPx, staticMaxWidthPx]);

  useEffect(() => {
    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, []);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) {
      return;
    }

    shell.style.setProperty("--eq-col-variable-width", `${variableWidthPx}px`);
    updateHandlePosition();
    updateMaxWidth();
  }, [updateHandlePosition, updateMaxWidth, variableWidthPx]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(storageKey, String(variableWidthPx));
    } catch {
      // Ignore storage failures so resizing still works in restricted environments.
    }
  }, [storageKey, variableWidthPx]);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell || typeof ResizeObserver === "undefined") {
      return undefined;
    }

    const observer = new ResizeObserver(() => {
      updateHandlePosition();
      updateMaxWidth();
    });
    observer.observe(shell);
    return () => observer.disconnect();
  }, [updateHandlePosition, updateMaxWidth]);

  useEffect(() => {
    setVariableWidthPx((current) => clampVariableWidthPx(current, minWidthPx, maxWidthPx));
  }, [maxWidthPx, minWidthPx]);

  const setClampedWidth = useCallback(
    (nextWidth: number) => {
      setVariableWidthPx(clampVariableWidthPx(nextWidth, minWidthPx, maxWidthPx));
    },
    [maxWidthPx, minWidthPx]
  );

  const onMouseDown = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      if (event.button !== 0) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setIsDragging(true);
      document.body.classList.add("panel-splitter-body-lock");
      dragStateRef.current = {
        startClientX: event.clientX,
        startWidthPx: variableWidthPx
      };

      const handleMouseMove = (moveEvent: MouseEvent) => {
        moveEvent.preventDefault();
        const dragState = dragStateRef.current;
        if (!dragState) {
          return;
        }

        setClampedWidth(
          dragState.startWidthPx + (moveEvent.clientX - dragState.startClientX)
        );
      };

      const finishDrag = () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", finishDrag);
        document.body.classList.remove("panel-splitter-body-lock");
        cleanupRef.current = null;
        dragStateRef.current = null;
        setIsDragging(false);
      };

      cleanupRef.current = finishDrag;
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", finishDrag);
    },
    [setClampedWidth, variableWidthPx]
  );

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setClampedWidth(variableWidthPx - KEYBOARD_STEP_PX);
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        setClampedWidth(variableWidthPx + KEYBOARD_STEP_PX);
        return;
      }

      if (event.key === "Home") {
        event.preventDefault();
        setClampedWidth(minWidthPx);
        return;
      }

      if (event.key === "End") {
        event.preventDefault();
        setClampedWidth(maxWidthPx);
      }
    },
    [maxWidthPx, minWidthPx, setClampedWidth, variableWidthPx]
  );

  const resizeHandleStyle: CSSProperties = {
    left: `${handleLeftPx}px`
  };

  return {
    shellRef,
    variableHeaderRef,
    resizeHandleProps: {
      "aria-label": "Resize variable column",
      "aria-orientation": "vertical" as const,
      "aria-valuemax": maxWidthPx,
      "aria-valuemin": minWidthPx,
      "aria-valuenow": Math.round(variableWidthPx),
      className: `equation-grid-column-resize${isDragging ? " is-active" : ""}`,
      onKeyDown,
      onMouseDown,
      role: "separator" as const,
      style: resizeHandleStyle,
      tabIndex: 0
    },
    shellClassName: isDragging ? "equation-grid-is-resizing-columns" : ""
  };
}
