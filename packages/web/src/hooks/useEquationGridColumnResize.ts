import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent
} from "react";

export const EQUATION_GRID_VARIABLE_WIDTH_STORAGE_KEY = {
  embedded: "sfcr.equation-grid.variable-column-px.embedded",
  workspace: "sfcr.equation-grid.variable-column-px"
} as const;

export const EQUATION_GRID_EXPRESSION_WIDTH_STORAGE_KEY = {
  embedded: "sfcr.equation-grid.expression-column-px.embedded",
  workspace: "sfcr.equation-grid.expression-column-px"
} as const;

const DEFAULT_VARIABLE_WIDTH_PX = {
  embedded: 160,
  workspace: 140
} as const;

const DEFAULT_EXPRESSION_WIDTH_PX = {
  embedded: 280,
  workspace: 320
} as const;

const MIN_VARIABLE_WIDTH_PX = {
  embedded: 120,
  workspace: 110
} as const;

const MIN_EXPRESSION_WIDTH_PX = {
  embedded: 160,
  workspace: 160
} as const;

const MAX_VARIABLE_WIDTH_PX = {
  embedded: 280,
  workspace: 240
} as const;

const MAX_EXPRESSION_WIDTH_PX = {
  embedded: 560,
  workspace: 640
} as const;

const MIN_TRAILING_WIDTH_PX = 160;
const EQUATION_VIEW_ROLE_WIDTH_PX = 68;
const KEYBOARD_STEP_PX = 8;
const RESIZE_HANDLE_HALF_WIDTH_PX = 6;

type EquationColumnResizeLayout = "equation-grid" | "equation-view";
type ResizableEquationColumn = "variable" | "expression";

interface UseEquationGridColumnResizeOptions {
  isEmbedded?: boolean;
  layout?: EquationColumnResizeLayout;
}

function getStoredWidthPx(storageKey: string, fallback: number) {
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

function clampWidthPx(nextWidth: number, minWidthPx: number, maxWidthPx: number) {
  return Math.min(Math.max(nextWidth, minWidthPx), maxWidthPx);
}

function getTrailingReservedWidthPx(layout: EquationColumnResizeLayout) {
  if (layout === "equation-view") {
    return (
      EQUATION_VIEW_ROLE_WIDTH_PX +
      MIN_TRAILING_WIDTH_PX +
      0.6 * 3 * 16 +
      0.75 * 16 +
      0.35 * 16
    );
  }

  return (
    72 +
    120 +
    34 +
    28 +
    18 +
    0.32 * 6 * 16 +
    0.24 * 2 * 16 +
    MIN_TRAILING_WIDTH_PX
  );
}

function getMaxColumnWidthPx(
  shellWidth: number,
  minWidthPx: number,
  staticMaxWidthPx: number,
  otherColumnWidthPx: number,
  layout: EquationColumnResizeLayout
) {
  if (shellWidth < 320) {
    return staticMaxWidthPx;
  }

  return Math.max(
    minWidthPx,
    shellWidth - otherColumnWidthPx - getTrailingReservedWidthPx(layout)
  );
}

function buildResizeHandleStyle(leftPx: number): CSSProperties {
  return {
    left: `${leftPx}px`
  };
}

export function useEquationGridColumnResize({
  isEmbedded = false,
  layout = "equation-grid"
}: UseEquationGridColumnResizeOptions = {}) {
  const variableStorageKey = isEmbedded
    ? EQUATION_GRID_VARIABLE_WIDTH_STORAGE_KEY.embedded
    : EQUATION_GRID_VARIABLE_WIDTH_STORAGE_KEY.workspace;
  const expressionStorageKey = isEmbedded
    ? EQUATION_GRID_EXPRESSION_WIDTH_STORAGE_KEY.embedded
    : EQUATION_GRID_EXPRESSION_WIDTH_STORAGE_KEY.workspace;
  const defaultVariableWidthPx = isEmbedded
    ? DEFAULT_VARIABLE_WIDTH_PX.embedded
    : DEFAULT_VARIABLE_WIDTH_PX.workspace;
  const defaultExpressionWidthPx = isEmbedded
    ? DEFAULT_EXPRESSION_WIDTH_PX.embedded
    : DEFAULT_EXPRESSION_WIDTH_PX.workspace;
  const minVariableWidthPx = isEmbedded
    ? MIN_VARIABLE_WIDTH_PX.embedded
    : MIN_VARIABLE_WIDTH_PX.workspace;
  const minExpressionWidthPx = isEmbedded
    ? MIN_EXPRESSION_WIDTH_PX.embedded
    : MIN_EXPRESSION_WIDTH_PX.workspace;
  const staticMaxVariableWidthPx = isEmbedded
    ? MAX_VARIABLE_WIDTH_PX.embedded
    : MAX_VARIABLE_WIDTH_PX.workspace;
  const staticMaxExpressionWidthPx = isEmbedded
    ? MAX_EXPRESSION_WIDTH_PX.embedded
    : MAX_EXPRESSION_WIDTH_PX.workspace;

  const shellRef = useRef<HTMLDivElement | null>(null);
  const variableHeaderRef = useRef<HTMLSpanElement | null>(null);
  const expressionHeaderRef = useRef<HTMLSpanElement | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const dragStateRef = useRef<{
    column: ResizableEquationColumn;
    startClientX: number;
    startWidthPx: number;
  } | null>(null);
  const [variableWidthPx, setVariableWidthPx] = useState(() =>
    getStoredWidthPx(variableStorageKey, defaultVariableWidthPx)
  );
  const [expressionWidthPx, setExpressionWidthPx] = useState(() =>
    getStoredWidthPx(expressionStorageKey, defaultExpressionWidthPx)
  );
  const [variableHandleLeftPx, setVariableHandleLeftPx] = useState(0);
  const [expressionHandleLeftPx, setExpressionHandleLeftPx] = useState(0);
  const [draggingColumn, setDraggingColumn] = useState<ResizableEquationColumn | null>(null);
  const [maxVariableWidthPx, setMaxVariableWidthPx] = useState<number>(staticMaxVariableWidthPx);
  const [maxExpressionWidthPx, setMaxExpressionWidthPx] = useState<number>(staticMaxExpressionWidthPx);

  const updateHandlePositions = useCallback(() => {
    const shell = shellRef.current;
    if (!shell) {
      return;
    }

    const shellRect = shell.getBoundingClientRect();
    const variableHeader = variableHeaderRef.current;
    const expressionHeader = expressionHeaderRef.current;

    if (variableHeader) {
      setVariableHandleLeftPx(
        variableHeader.getBoundingClientRect().right -
          shellRect.left -
          RESIZE_HANDLE_HALF_WIDTH_PX
      );
    }

    if (expressionHeader) {
      setExpressionHandleLeftPx(
        expressionHeader.getBoundingClientRect().right -
          shellRect.left -
          RESIZE_HANDLE_HALF_WIDTH_PX
      );
    }
  }, []);

  const updateMaxWidths = useCallback(() => {
    const shell = shellRef.current;
    if (!shell) {
      setMaxVariableWidthPx(staticMaxVariableWidthPx);
      setMaxExpressionWidthPx(staticMaxExpressionWidthPx);
      return;
    }

    const shellWidth = shell.getBoundingClientRect().width;
    setMaxVariableWidthPx(
      Math.min(
        staticMaxVariableWidthPx,
        getMaxColumnWidthPx(
          shellWidth,
          minVariableWidthPx,
          staticMaxVariableWidthPx,
          expressionWidthPx,
          layout
        )
      )
    );
    setMaxExpressionWidthPx(
      Math.min(
        staticMaxExpressionWidthPx,
        getMaxColumnWidthPx(
          shellWidth,
          minExpressionWidthPx,
          staticMaxExpressionWidthPx,
          variableWidthPx,
          layout
        )
      )
    );
  }, [
    expressionWidthPx,
    layout,
    minExpressionWidthPx,
    minVariableWidthPx,
    staticMaxExpressionWidthPx,
    staticMaxVariableWidthPx,
    variableWidthPx
  ]);

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
    shell.style.setProperty("--eq-col-expression-width", `${expressionWidthPx}px`);
    updateHandlePositions();
    updateMaxWidths();
  }, [
    expressionWidthPx,
    updateHandlePositions,
    updateMaxWidths,
    variableWidthPx
  ]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(variableStorageKey, String(variableWidthPx));
    } catch {
      // Ignore storage failures so resizing still works in restricted environments.
    }
  }, [variableStorageKey, variableWidthPx]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(expressionStorageKey, String(expressionWidthPx));
    } catch {
      // Ignore storage failures so resizing still works in restricted environments.
    }
  }, [expressionStorageKey, expressionWidthPx]);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell || typeof ResizeObserver === "undefined") {
      return undefined;
    }

    const observer = new ResizeObserver(() => {
      updateHandlePositions();
      updateMaxWidths();
    });
    observer.observe(shell);
    return () => observer.disconnect();
  }, [updateHandlePositions, updateMaxWidths]);

  useEffect(() => {
    setVariableWidthPx((current) =>
      clampWidthPx(current, minVariableWidthPx, maxVariableWidthPx)
    );
  }, [maxVariableWidthPx, minVariableWidthPx]);

  useEffect(() => {
    setExpressionWidthPx((current) =>
      clampWidthPx(current, minExpressionWidthPx, maxExpressionWidthPx)
    );
  }, [maxExpressionWidthPx, minExpressionWidthPx]);

  const setClampedVariableWidth = useCallback(
    (nextWidth: number) => {
      setVariableWidthPx(clampWidthPx(nextWidth, minVariableWidthPx, maxVariableWidthPx));
    },
    [maxVariableWidthPx, minVariableWidthPx]
  );

  const setClampedExpressionWidth = useCallback(
    (nextWidth: number) => {
      setExpressionWidthPx(clampWidthPx(nextWidth, minExpressionWidthPx, maxExpressionWidthPx));
    },
    [maxExpressionWidthPx, minExpressionWidthPx]
  );

  const createMouseDownHandler = useCallback(
    (column: ResizableEquationColumn) => (event: ReactMouseEvent<HTMLElement>) => {
      if (event.button !== 0) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setDraggingColumn(column);
      document.body.classList.add("panel-splitter-body-lock");
      dragStateRef.current = {
        column,
        startClientX: event.clientX,
        startWidthPx: column === "variable" ? variableWidthPx : expressionWidthPx
      };

      const handleMouseMove = (moveEvent: MouseEvent) => {
        moveEvent.preventDefault();
        const dragState = dragStateRef.current;
        if (!dragState) {
          return;
        }

        const nextWidth =
          dragState.startWidthPx + (moveEvent.clientX - dragState.startClientX);
        if (dragState.column === "variable") {
          setClampedVariableWidth(nextWidth);
          return;
        }

        setClampedExpressionWidth(nextWidth);
      };

      const finishDrag = () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", finishDrag);
        document.body.classList.remove("panel-splitter-body-lock");
        cleanupRef.current = null;
        dragStateRef.current = null;
        setDraggingColumn(null);
      };

      cleanupRef.current = finishDrag;
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", finishDrag);
    },
    [expressionWidthPx, setClampedExpressionWidth, setClampedVariableWidth, variableWidthPx]
  );

  const createKeyDownHandler = useCallback(
    (
      column: ResizableEquationColumn,
      widthPx: number,
      minWidthPx: number,
      maxWidthPx: number,
      setClampedWidth: (nextWidth: number) => void
    ) =>
      (event: ReactKeyboardEvent<HTMLElement>) => {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          setClampedWidth(widthPx - KEYBOARD_STEP_PX);
          return;
        }

        if (event.key === "ArrowRight") {
          event.preventDefault();
          setClampedWidth(widthPx + KEYBOARD_STEP_PX);
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
    []
  );

  return {
    shellRef,
    variableHeaderRef,
    expressionHeaderRef,
    variableResizeHandleProps: {
      "aria-label": "Resize variable column",
      "aria-orientation": "vertical" as const,
      "aria-valuemax": maxVariableWidthPx,
      "aria-valuemin": minVariableWidthPx,
      "aria-valuenow": Math.round(variableWidthPx),
      className: `equation-grid-column-resize${
        draggingColumn === "variable" ? " is-active" : ""
      }`,
      onKeyDown: createKeyDownHandler(
        "variable",
        variableWidthPx,
        minVariableWidthPx,
        maxVariableWidthPx,
        setClampedVariableWidth
      ),
      onMouseDown: createMouseDownHandler("variable"),
      role: "separator" as const,
      style: buildResizeHandleStyle(variableHandleLeftPx),
      tabIndex: 0
    },
    expressionResizeHandleProps: {
      "aria-label": "Resize expression column",
      "aria-orientation": "vertical" as const,
      "aria-valuemax": maxExpressionWidthPx,
      "aria-valuemin": minExpressionWidthPx,
      "aria-valuenow": Math.round(expressionWidthPx),
      className: `equation-grid-column-resize${
        draggingColumn === "expression" ? " is-active" : ""
      }`,
      onKeyDown: createKeyDownHandler(
        "expression",
        expressionWidthPx,
        minExpressionWidthPx,
        maxExpressionWidthPx,
        setClampedExpressionWidth
      ),
      onMouseDown: createMouseDownHandler("expression"),
      role: "separator" as const,
      style: buildResizeHandleStyle(expressionHandleLeftPx),
      tabIndex: 0
    },
    // Backward-compatible alias for callers that only expose one handle.
    resizeHandleProps: {
      "aria-label": "Resize variable column",
      "aria-orientation": "vertical" as const,
      "aria-valuemax": maxVariableWidthPx,
      "aria-valuemin": minVariableWidthPx,
      "aria-valuenow": Math.round(variableWidthPx),
      className: `equation-grid-column-resize${
        draggingColumn === "variable" ? " is-active" : ""
      }`,
      onKeyDown: createKeyDownHandler(
        "variable",
        variableWidthPx,
        minVariableWidthPx,
        maxVariableWidthPx,
        setClampedVariableWidth
      ),
      onMouseDown: createMouseDownHandler("variable"),
      role: "separator" as const,
      style: buildResizeHandleStyle(variableHandleLeftPx),
      tabIndex: 0
    },
    shellClassName: draggingColumn ? "equation-grid-is-resizing-columns" : ""
  };
}
