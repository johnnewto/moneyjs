import type {
  ModelDefinition,
  ScenarioDefinition,
  SimulationOptions,
  SimulationResult
} from "@sfcr/core";

export interface EditorState {
  model: ModelDefinition;
  scenario: ScenarioDefinition | null;
  options: SimulationOptions;
  baselineResult: SimulationResult | null;
  scenarioResult: SimulationResult | null;
  selectedVariables: string[];
}
