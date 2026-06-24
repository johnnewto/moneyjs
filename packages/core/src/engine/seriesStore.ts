import type { SimulationOptions, SimulationType } from "../model/types";
import type { SolverContext } from "./context";

export class SeriesStore implements SolverContext {
  readonly series: Record<string, Float64Array>;

  constructor(
    variableNames: string[],
    periods: number,
    private readonly period: number
  ) {
    this.series = Object.fromEntries(
      variableNames.map((name) => [name, new Float64Array(periods)])
    );
  }

  currentValue(variable: string): number {
    return this.requireSeries(variable)[this.period] ?? NaN;
  }

  lagValue(variable: string, offset = 1): number {
    return this.requireSeries(variable)[this.period - offset] ?? NaN;
  }

  diffValue(variable: string): number {
    return this.currentValue(variable) - this.lagValue(variable);
  }

  setCurrentValue(variable: string, value: number): void {
    this.requireSeries(variable)[this.period] = value;
  }

  hasSeries(variable: string): boolean {
    return variable in this.series;
  }

  shifted(offset: number): SolverContext {
    return new PeriodSolverContext(this.series, this.period - offset);
  }

  seriesFor(variable: string): Float64Array {
    return this.requireSeries(variable);
  }

  static createForModel(
    endogenousNames: string[],
    externalNames: string[],
    options: SimulationOptions
  ): Record<string, Float64Array> {
    const series: Record<string, Float64Array> = {};
    for (const name of [...endogenousNames, ...externalNames]) {
      const values = new Float64Array(options.periods);
      values.fill(options.defaultInitialValue ?? 1e-15);
      series[name] = values;
    }
    return series;
  }

  static forPeriod(
    series: Record<string, Float64Array>,
    period: number,
    options?: {
      simType?: SimulationType;
      observed?: Record<string, Float64Array>;
    }
  ): SolverContext {
    return new PeriodSolverContext(series, period, options?.simType, options?.observed);
  }

  private requireSeries(variable: string): Float64Array {
    const values = this.series[variable];
    if (!values) {
      throw new Error(`Unknown variable: ${variable}`);
    }
    return values;
  }
}

class PeriodSolverContext implements SolverContext {
  constructor(
    private readonly series: Record<string, Float64Array>,
    private readonly period: number,
    private readonly simType: SimulationType = "DYNAMIC",
    private readonly observed: Record<string, Float64Array> = {},
    private readonly readCurrentFromObserved = false
  ) {}

  currentValue(variable: string): number {
    if (this.readCurrentFromObserved) {
      const observedValues = this.observed[variable];
      if (observedValues) {
        return observedValues[clampObservedIndex(this.period, observedValues)] ?? NaN;
      }
    }
    return this.requireSeries(variable)[this.period] ?? NaN;
  }

  lagValue(variable: string, offset = 1): number {
    if (this.simType === "STATIC") {
      const observedValues = this.observed[variable];
      if (observedValues) {
        return observedValues[clampObservedIndex(this.period - offset, observedValues)] ?? NaN;
      }
    }
    return this.requireSeries(variable)[this.period - offset] ?? NaN;
  }

  diffValue(variable: string): number {
    return this.currentValue(variable) - this.lagValue(variable);
  }

  setCurrentValue(variable: string, value: number): void {
    this.requireSeries(variable)[this.period] = value;
  }

  hasSeries(variable: string): boolean {
    return variable in this.series || variable in this.observed;
  }

  shifted(offset: number): SolverContext {
    return new PeriodSolverContext(
      this.series,
      this.period - offset,
      this.simType,
      this.observed,
      this.simType === "STATIC"
    );
  }

  private requireSeries(variable: string): Float64Array {
    const values = this.series[variable];
    if (!values) {
      throw new Error(`Unknown variable: ${variable}`);
    }
    return values;
  }
}

function clampObservedIndex(index: number, values: Float64Array): number {
  if (index < 0) {
    return 0;
  }
  if (index >= values.length) {
    return values.length - 1;
  }
  return index;
}
