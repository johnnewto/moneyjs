import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";

const DRAG_SCROLL_THRESHOLD_PX = 4;
const NON_DRAGGABLE_TARGET_SELECTOR = [
  "input",
  "select",
  "textarea",
  "[contenteditable='true']",
  "[data-drag-scroll-ignore='true']"
].join(", ");

export function useDragScroll<T extends HTMLElement>() {
  const surfaceRef = useRef<T | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const suppressClickRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isSelectionModifierPressed, setIsSelectionModifierPressed] = useState(false);

  useEffect(() => {
    const updateSelectionModifierState = (event: KeyboardEvent) => {
      const nextValue = event.ctrlKey || event.metaKey;
      setIsSelectionModifierPressed((current) => (current === nextValue ? current : nextValue));
    };

    const clearSelectionModifierState = () => {
      setIsSelectionModifierPressed((current) => (current ? false : current));
    };

    window.addEventListener("keydown", updateSelectionModifierState);
    window.addEventListener("keyup", updateSelectionModifierState);
    window.addEventListener("blur", clearSelectionModifierState);

    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
      window.removeEventListener("keydown", updateSelectionModifierState);
      window.removeEventListener("keyup", updateSelectionModifierState);
      window.removeEventListener("blur", clearSelectionModifierState);
    };
  }, []);

  const onMouseDown = useCallback((event: ReactMouseEvent<T>) => {
    if (event.button !== 0) {
      return;
    }

    if (event.ctrlKey || event.metaKey) {
      return;
    }

    const target = event.target instanceof HTMLElement ? event.target : null;
    if (target?.closest(NON_DRAGGABLE_TARGET_SELECTOR)) {
      return;
    }

    const surface = surfaceRef.current;
    if (
      !surface ||
      (surface.scrollHeight <= surface.clientHeight && surface.scrollWidth <= surface.clientWidth)
    ) {
      return;
    }

    const startX = event.clientX;
    const startY = event.clientY;
    const startScrollLeft = surface.scrollLeft;
    const startScrollTop = surface.scrollTop;
    let dragging = false;

    const finishDrag = () => {
      if (dragging) {
        document.body.classList.remove("drag-scroll-body-lock");
        setIsDragging(false);
      }
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      cleanupRef.current = null;
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      if (
        !dragging &&
        Math.abs(deltaX) < DRAG_SCROLL_THRESHOLD_PX &&
        Math.abs(deltaY) < DRAG_SCROLL_THRESHOLD_PX
      ) {
        return;
      }

      if (!dragging) {
        dragging = true;
        suppressClickRef.current = true;
        document.body.classList.add("drag-scroll-body-lock");
        setIsDragging(true);
      }

      moveEvent.preventDefault();
      surface.scrollLeft = startScrollLeft - deltaX;
      surface.scrollTop = startScrollTop - deltaY;
    };

    const handleMouseUp = () => {
      finishDrag();
    };

    cleanupRef.current = finishDrag;
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, []);

  const onClickCapture = useCallback((event: ReactMouseEvent<T>) => {
    if (!suppressClickRef.current) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    suppressClickRef.current = false;
  }, []);

  return {
    dragScrollRef: surfaceRef,
    dragScrollProps: {
      className: [
        "drag-scroll-surface",
        isDragging ? "drag-scroll-active" : "",
        !isDragging && isSelectionModifierPressed ? "drag-scroll-select-mode" : ""
      ]
        .filter(Boolean)
        .join(" "),
      onClickCapture,
      onMouseDown
    }
  };
}
