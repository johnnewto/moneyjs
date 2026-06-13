import type { Ref } from "react";

export function NotebookCommandsToggle({
  buttonRef,
  isOpen,
  onToggle
}: {
  buttonRef?: Ref<HTMLButtonElement>;
  isOpen: boolean;
  onToggle(): void;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      id="notebook-commands-toggle"
      className="notebook-commands-toggle"
      aria-controls="notebook-commands-panel"
      aria-expanded={isOpen}
      aria-pressed={isOpen}
      onClick={onToggle}
    >
      Commands
    </button>
  );
}
