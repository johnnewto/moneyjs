import type { ModelDefinition, SimulationOptions } from "../model/types";

export const bmwBaselineModel: ModelDefinition = {
  equations: [
    { name: "Cs", expression: "Cd", role: "definition" },
    { name: "Is", expression: "Id", role: "definition" },
    { name: "Ns", expression: "Nd", role: "definition" },
    { name: "Ls", expression: "lag(Ls) + Ld - lag(Ld)", role: "accumulation" },
    { name: "Y", expression: "Cs + Is", role: "identity" },
    { name: "WBd", expression: "Y - lag(rl) * lag(Ld) - AF", role: "identity" },
    { name: "AF", expression: "delta * lag(K)", role: "definition" },
    { name: "Ld", expression: "lag(Ld) + Id - AF", role: "accumulation" },
    { name: "YD", expression: "WBs + lag(rm) * lag(Mh)", role: "identity" },
    { name: "Mh", expression: "lag(Mh) + YD - Cd", role: "accumulation" },
    { name: "Ms", expression: "lag(Ms) + Ls - lag(Ls)", role: "accumulation" },
    { name: "rm", expression: "rl", role: "definition" },
    { name: "WBs", expression: "W * Ns", role: "identity" },
    { name: "Nd", expression: "Y / pr", role: "definition" },
    { name: "W", expression: "WBd / Nd", role: "definition" },
    { name: "Cd", expression: "alpha0 + alpha1 * YD + alpha2 * lag(Mh)", role: "behavioral" },
    { name: "K", expression: "lag(K) + Id - DA", role: "accumulation" },
    { name: "DA", expression: "delta * lag(K)", role: "definition" },
    { name: "KT", expression: "kappa * lag(Y)", role: "target" },
    { name: "Id", expression: "gamma * (KT - lag(K)) + DA", role: "behavioral" }
  ],
  externals: {
    rl: { kind: "constant", value: 0.025 },
    alpha0: { kind: "constant", value: 20 },
    alpha1: { kind: "constant", value: 0.75 },
    alpha2: { kind: "constant", value: 0.1 },
    delta: { kind: "constant", value: 0.1 },
    gamma: { kind: "constant", value: 0.15 },
    kappa: { kind: "constant", value: 1 },
    pr: { kind: "constant", value: 1 }
  },
  initialValues: {}
};

export const bmwBaselineOptions: SimulationOptions = {
  periods: 12,
  solverMethod: "NEWTON",
  tolerance: 1e-10,
  maxIterations: 100,
  defaultInitialValue: 1e-15
};
