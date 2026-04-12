import type { ModelDefinition, ScenarioDefinition, SimulationOptions } from "../model/types";

export const simBaselineModel: ModelDefinition = {
  equations: [
    { name: "TXs", expression: "TXd" },
    { name: "YD", expression: "W * Ns - TXs" },
    { name: "Cd", expression: "alpha1 * YD + alpha2 * lag(Hh)" },
    { name: "Hh", expression: "YD - Cd + lag(Hh)" },
    { name: "Ns", expression: "Nd" },
    { name: "Nd", expression: "Y / W" },
    { name: "Cs", expression: "Cd" },
    { name: "Gs", expression: "Gd" },
    { name: "Y", expression: "Cs + Gs" },
    { name: "TXd", expression: "theta * W * Ns" },
    { name: "Hs", expression: "Gd - TXd + lag(Hs)" }
  ],
  externals: {
    Gd: { kind: "constant", value: 20 },
    W: { kind: "constant", value: 1 },
    alpha1: { kind: "constant", value: 0.6 },
    alpha2: { kind: "constant", value: 0.4 },
    theta: { kind: "constant", value: 0.2 }
  },
  initialValues: {}
};

export const simBaselineOptions: SimulationOptions = {
  periods: 10,
  solverMethod: "BROYDEN",
  tolerance: 1e-8,
  maxIterations: 350,
  defaultInitialValue: 1e-15,
  hiddenEquation: {
    leftVariable: "Hh",
    rightVariable: "Hs",
    tolerance: 1e-5
  }
};

export const simGovernmentSpendingShock: ScenarioDefinition = {
  shocks: [
    {
      startPeriodInclusive: 5,
      endPeriodInclusive: 10,
      variables: {
        Gd: { kind: "constant", value: 30 }
      }
    }
  ]
};
