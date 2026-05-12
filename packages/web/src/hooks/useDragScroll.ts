import { useCallback, useRef, type MouseEvent as ReactMouseEvent } from "react";

export function useDragScroll<T extends HTMLElement>() {
  const surfaceRef = useRef<T | null>(null);
  const onMouseDown = useCallback((_event: ReactMouseEvent<T>) => {}, []);
  const onClickCapture = useCallback((_event: ReactMouseEvent<T>) => {}, []);

  return {
    dragScrollRef: surfaceRef,
    dragScrollProps: {
      className: "",
      onClickCapture,
      onMouseDown
    }
  };
}
