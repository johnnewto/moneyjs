interface GridRowControlsProps {
  canMoveDown: boolean;
  canMoveUp: boolean;
  canRemove?: boolean;
  onInsertAfter(): void;
  onMoveDown(): void;
  onMoveUp(): void;
  onRemove(): void;
  rowIndex: number;
  rowTypeLabel: string;
}

export function GridRowControls({
  canMoveDown,
  canMoveUp,
  canRemove = true,
  onInsertAfter,
  onMoveDown,
  onMoveUp,
  onRemove,
  rowIndex,
  rowTypeLabel
}: GridRowControlsProps) {
  const rowNumber = rowIndex + 1;

  return (
    <div className="grid-editor-row-controls">
      <button
        type="button"
        className="secondary-button grid-editor-symbol-button"
        onClick={onInsertAfter}
        aria-label={`Insert ${rowTypeLabel} after ${rowNumber}`}
        title="Insert row after"
      >
        ➕
      </button>
      <button
        type="button"
        className="secondary-button grid-editor-symbol-button"
        onClick={onRemove}
        disabled={!canRemove}
        aria-label={`Remove ${rowTypeLabel} ${rowNumber}`}
        title="Remove row"
      >
        ➖
      </button>
      <button
        type="button"
        className="secondary-button grid-editor-symbol-button"
        onClick={onMoveUp}
        disabled={!canMoveUp}
        aria-label={`Move ${rowTypeLabel} ${rowNumber} up`}
        title="Move row up"
      >
        ⇑
      </button>
      <button
        type="button"
        className="secondary-button grid-editor-symbol-button"
        onClick={onMoveDown}
        disabled={!canMoveDown}
        aria-label={`Move ${rowTypeLabel} ${rowNumber} down`}
        title="Move row down"
      >
        ⇓
      </button>
    </div>
  );
}
