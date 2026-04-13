import {
  type ComponentPropsWithoutRef,
  type ElementType,
  type FocusEvent,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState
} from "react";
import { createPortal } from "react-dom";

type Placement = "top" | "bottom";

type InstantTooltipProps<T extends ElementType> = {
  as?: T;
  children: ReactNode;
  className?: string;
  tooltip?: string;
} & Omit<ComponentPropsWithoutRef<T>, "as" | "children" | "className">;

const VIEWPORT_PADDING = 8;
const TOOLTIP_GAP = 10;

export function InstantTooltip<T extends ElementType = "span">({
  as,
  children,
  className,
  tooltip,
  ...rest
}: InstantTooltipProps<T>) {
  const Component = (as ?? "span") as ElementType;
  const anchorRef = useRef<HTMLElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const tooltipId = useId();
  const [isVisible, setIsVisible] = useState(false);
  const [layout, setLayout] = useState<{ left: number; placement: Placement; top: number }>({
    left: 0,
    placement: "top",
    top: 0
  });

  const updatePosition = useCallback(() => {
    if (!tooltip || !anchorRef.current || !tooltipRef.current) {
      return;
    }

    const anchorRect = anchorRef.current.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    const maxLeft = Math.max(VIEWPORT_PADDING, window.innerWidth - tooltipRect.width - VIEWPORT_PADDING);
    const left = Math.min(
      Math.max(anchorRect.left + anchorRect.width / 2 - tooltipRect.width / 2, VIEWPORT_PADDING),
      maxLeft
    );
    const preferredTop = anchorRect.top - tooltipRect.height - TOOLTIP_GAP;
    const placement: Placement = preferredTop >= VIEWPORT_PADDING ? "top" : "bottom";
    const top =
      placement === "top"
        ? preferredTop
        : Math.min(
            anchorRect.bottom + TOOLTIP_GAP,
            Math.max(VIEWPORT_PADDING, window.innerHeight - tooltipRect.height - VIEWPORT_PADDING)
          );

    setLayout({ left, placement, top });
  }, [tooltip]);

  useLayoutEffect(() => {
    if (!isVisible || !tooltip) {
      return;
    }

    updatePosition();

    function handleViewportChange(): void {
      updatePosition();
    }

    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [isVisible, tooltip, updatePosition]);

  const componentProps = rest as ComponentPropsWithoutRef<T> & {
    onBlur?: (event: FocusEvent<HTMLElement>) => void;
    onFocus?: (event: FocusEvent<HTMLElement>) => void;
    onMouseEnter?: (event: MouseEvent<HTMLElement>) => void;
    onMouseLeave?: (event: MouseEvent<HTMLElement>) => void;
  };

  return (
    <>
      <Component
        {...componentProps}
        aria-describedby={tooltip ? tooltipId : undefined}
        className={className}
        onBlur={(event: FocusEvent<HTMLElement>) => {
          componentProps.onBlur?.(event);
          setIsVisible(false);
        }}
        onFocus={(event: FocusEvent<HTMLElement>) => {
          componentProps.onFocus?.(event);
          if (tooltip) {
            setIsVisible(true);
          }
        }}
        onMouseEnter={(event: MouseEvent<HTMLElement>) => {
          componentProps.onMouseEnter?.(event);
          if (tooltip) {
            setIsVisible(true);
          }
        }}
        onMouseLeave={(event: MouseEvent<HTMLElement>) => {
          componentProps.onMouseLeave?.(event);
          setIsVisible(false);
        }}
        ref={(node: HTMLElement | null) => {
          anchorRef.current = node;
          const externalRef = (componentProps as { ref?: ((node: HTMLElement | null) => void) | { current: HTMLElement | null } }).ref;
          if (typeof externalRef === "function") {
            externalRef(node);
          } else if (externalRef && typeof externalRef === "object") {
            externalRef.current = node;
          }
        }}
      >
        {children}
      </Component>
      {isVisible && tooltip
        ? createPortal(
            <div
              id={tooltipId}
              ref={tooltipRef}
              className={`instant-tooltip-bubble instant-tooltip-${layout.placement}`}
              role="tooltip"
              style={{
                left: `${layout.left}px`,
                maxWidth: `${Math.min(448, Math.max(window.innerWidth - VIEWPORT_PADDING * 2, 160))}px`,
                top: `${layout.top}px`
              }}
            >
              {tooltip}
            </div>,
            document.body
          )
        : null}
    </>
  );
}
