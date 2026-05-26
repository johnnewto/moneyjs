import { useMemo } from "react";

import { heuristicSliderRange } from "../lib/externalParameterControls";

interface ParameterSliderControlProps {
  ariaLabel: string;
  baselineValue: number;
  onChange(value: number): void;
  onRelease(): void;
  value: number;
}

export function ParameterSliderControl({
  ariaLabel,
  baselineValue,
  onChange,
  onRelease,
  value
}: ParameterSliderControlProps) {
  const range = useMemo(() => heuristicSliderRange(baselineValue), [baselineValue]);
  const clampedValue = Math.min(Math.max(value, range.min), range.max);

  return (
    <input
      type="range"
      className="parameter-slider-input"
      min={range.min}
      max={range.max}
      step={range.step}
      value={clampedValue}
      aria-label={ariaLabel}
      onChange={(event) => onChange(Number(event.target.value))}
      onPointerUp={onRelease}
      onMouseUp={onRelease}
      onKeyUp={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          onRelease();
        }
      }}
    />
  );
}
