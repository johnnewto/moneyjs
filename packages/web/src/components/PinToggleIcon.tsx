const PIN_ICON_PROPS = {
  viewBox: "0 0 16 16",
  width: 16,
  height: 16,
  focusable: false as const,
  "aria-hidden": true as const
};

const PIN_STROKE_WIDTH = 1.25;
const PIN_HEAD = { cx: 6.5, cy: 4.75, r: 2.1 };
const PIN_SHAFT_PATH = "M7.45 6.15 10.85 12.35";

/** Compact angled pushpin for 16px toolbar buttons (Lucide-inspired, simplified paths). */
export function PinToggleIcon({ pinned }: { pinned: boolean }) {
  if (pinned) {
    return (
      <svg {...PIN_ICON_PROPS} className="pin-toggle-icon pin-toggle-icon-on">
        <circle cx={PIN_HEAD.cx} cy={PIN_HEAD.cy} r={PIN_HEAD.r} fill="currentColor" />
        <path
          d={PIN_SHAFT_PATH}
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={PIN_STROKE_WIDTH}
        />
      </svg>
    );
  }

  return (
    <svg {...PIN_ICON_PROPS} className="pin-toggle-icon pin-toggle-icon-off">
      <circle
        cx={PIN_HEAD.cx}
        cy={PIN_HEAD.cy}
        r={PIN_HEAD.r}
        fill="none"
        stroke="currentColor"
        strokeWidth={PIN_STROKE_WIDTH}
      />
      <path
        d={PIN_SHAFT_PATH}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={PIN_STROKE_WIDTH}
      />
    </svg>
  );
}
