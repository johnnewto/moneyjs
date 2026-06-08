import type { JSX } from "react";

export function EquationColumnToggle({
  column,
  collapsed,
  interactive = true,
  onToggle
}: {
  column: "Initial" | "Current" | "Gain" | "Role";
  collapsed: boolean;
  interactive?: boolean;
  onToggle?(): void;
}): JSX.Element {
  const label = collapsed ? `Expand ${column} column` : `Collapse ${column} column`;

  if (!interactive) {
    return (
      <span className="notebook-model-view-column-toggle is-static" aria-hidden="true">
        <span className="notebook-model-view-column-toggle-icon">{collapsed ? "▸" : "▾"}</span>
      </span>
    );
  }

  return (
    <button
      type="button"
      className="notebook-model-view-column-toggle"
      aria-expanded={!collapsed}
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onToggle?.();
      }}
    >
      <span className="notebook-model-view-column-toggle-icon" aria-hidden="true">
        {collapsed ? "▸" : "▾"}
      </span>
    </button>
  );
}
