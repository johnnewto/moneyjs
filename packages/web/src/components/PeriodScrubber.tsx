interface PeriodScrubberProps {
  maxIndex: number;
  onChange(nextIndex: number): void;
  selectedIndex: number;
}

export function PeriodScrubber({
  maxIndex,
  onChange,
  selectedIndex
}: PeriodScrubberProps) {
  const clampedIndex = Math.min(Math.max(selectedIndex, 0), maxIndex);

  return (
    <section className="control-panel period-scrubber" aria-label="Simulation period navigation">
      <div className="period-scrubber-bar">
        <div className="period-scrubber-label" aria-live="polite">
          Period {clampedIndex + 1} of {maxIndex + 1}
        </div>
        <div className="period-scrubber-controls">
          <button
            type="button"
            className="secondary-button"
            onClick={() => onChange(Math.max(clampedIndex - 1, 0))}
            disabled={clampedIndex === 0}
          >
            Previous
          </button>
          <input
            type="range"
            min={0}
            max={maxIndex}
            step={1}
            value={clampedIndex}
            onChange={(event) => onChange(Number(event.target.value))}
            aria-label="Selected simulation period"
          />
          <button
            type="button"
            className="secondary-button"
            onClick={() => onChange(Math.min(clampedIndex + 1, maxIndex))}
            disabled={clampedIndex === maxIndex}
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}
