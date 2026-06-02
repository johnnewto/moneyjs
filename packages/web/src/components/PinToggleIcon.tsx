export function PinToggleIcon({ pinned }: { pinned: boolean }) {
  if (pinned) {
    return (
      <svg viewBox="0 0 16 16" focusable="false" aria-hidden="true" className="pin-toggle-icon pin-toggle-icon-on">
        <circle cx="8" cy="3.5" r="1.55" fill="currentColor" />
        <path
          d="M8 5.2v7.3M5.75 13.5h4.5"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.35"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 16 16" focusable="false" aria-hidden="true" className="pin-toggle-icon pin-toggle-icon-off">
      <circle cx="8" cy="3.5" r="1.55" fill="none" stroke="currentColor" strokeWidth="1.35" />
      <path
        d="M8 5.2v7.3M5.75 13.5h4.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.35"
      />
    </svg>
  );
}
