import type { SimulationOptions } from "../model/types";
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

  lagValue(variable: string): number {
    return this.requireSeries(variable)[this.period - 1] ?? NaN;
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
    period: number
  ): SolverContext {
    return new PeriodSolverContext(series, period);
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
    private readonly period: number
  ) {}

  currentValue(variable: string): number {
    return this.requireSeries(variable)[this.period] ?? NaN;
  }

  lagValue(variable: string): number {
    return this.requireSeries(variable)[this.period - 1] ?? NaN;
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

  private requireSeries(variable: string): Float64Array {
    const values = this.series[variable];
    if (!values) {
      throw new Error(`Unknown variable: ${variable}`);
    }
    return values;
  }
}
