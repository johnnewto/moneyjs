import type { ModelDefinition, SimulationOptions } from "../model/types";

export const bmwBaselineModel: ModelDefinition = {
  equations: [
    { name: "Cs", expression: "Cd" },
    { name: "Is", expression: "Id" },
    { name: "Ns", expression: "Nd" },
    { name: "Ls", expression: "lag(Ls) + Ld - lag(Ld)" },
    { name: "Y", expression: "Cs + Is" },
    { name: "WBd", expression: "Y - lag(rl) * lag(Ld) - AF" },
    { name: "AF", expression: "delta * lag(K)" },
    { name: "Ld", expression: "lag(Ld) + Id - AF" },
    { name: "YD", expression: "WBs + lag(rm) * lag(Mh)" },
    { name: "Mh", expression: "lag(Mh) + YD - Cd" },
    { name: "Ms", expression: "lag(Ms) + Ls - lag(Ls)" },
    { name: "rm", expression: "rl" },
    { name: "WBs", expression: "W * Ns" },
    { name: "Nd", expression: "Y / pr" },
    { name: "W", expression: "WBd / Nd" },
    { name: "Cd", expression: "alpha0 + alpha1 * YD + alpha2 * lag(Mh)" },
    { name: "K", expression: "lag(K) + Id - DA" },
    { name: "DA", expression: "delta * lag(K)" },
    { name: "KT", expression: "kappa * lag(Y)" },
    { name: "Id", expression: "gamma * (KT - lag(K)) + DA" }
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
