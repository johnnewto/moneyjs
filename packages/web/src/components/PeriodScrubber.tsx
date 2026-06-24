import { useEffect, useState, useTransition, type ReactNode } from "react";

interface PeriodScrubberProps {
  maxIndex: number;
  onChange(nextIndex: number): void;
  selectedIndex: number;
  summarySlot?: ReactNode;
}

export function PeriodScrubber({
  maxIndex,
  onChange,
  selectedIndex,
  summarySlot
}: PeriodScrubberProps) {
  const clampedIndex = Math.min(Math.max(selectedIndex, 0), maxIndex);
  const [dragIndex, setDragIndex] = useState(clampedIndex);
  const [, startTransition] = useTransition();

  useEffect(() => {
    setDragIndex(clampedIndex);
  }, [clampedIndex]);

  const displayIndex = Math.min(Math.max(dragIndex, 0), maxIndex);

  const commit = (nextIndex: number) => {
    const bounded = Math.min(Math.max(nextIndex, 0), maxIndex);
    setDragIndex(bounded);
    startTransition(() => {
      onChange(bounded);
    });
  };

  return (
    <section className="control-panel period-scrubber" aria-label="Simulation period navigation">
      <div className="period-scrubber-bar">
        <div className="period-scrubber-label" aria-live="polite">
          Period {displayIndex + 1} of {maxIndex + 1}
        </div>
        <div className="period-scrubber-controls">
          <button
            type="button"
            className="secondary-button"
            onClick={() => commit(displayIndex - 1)}
            disabled={displayIndex === 0}
          >
            Previous
          </button>
          <input
            type="range"
            min={0}
            max={maxIndex}
            step={1}
            value={displayIndex}
            onChange={(event) => commit(Number(event.target.value))}
            aria-label="Selected simulation period"
          />
          <button
            type="button"
            className="secondary-button"
            onClick={() => commit(displayIndex + 1)}
            disabled={displayIndex === maxIndex}
          >
            Next
          </button>
        </div>
        {summarySlot ? <div className="period-scrubber-summary">{summarySlot}</div> : null}
      </div>
    </section>
  );
}
