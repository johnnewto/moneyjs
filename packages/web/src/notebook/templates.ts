import {
  bmwBaselineModel,
  bmwBaselineOptions,
  type ScenarioDefinition,
  type SimulationOptions
} from "@sfcr/core";

import { editorStateFromModel } from "../lib/editorModel";
import type { NotebookDocument } from "./types";

const BMW_DESCRIPTIONS: Record<string, string> = {
  AF: "Amortization funds",
  Cd: "Consumption goods demand by households",
  Cs: "Consumption goods supply",
  DA: "Depreciation allowance",
  K: "Stock of capital",
  KT: "Target stock of capital",
  Ld: "Demand for bank loans",
  Ls: "Supply of bank loans",
  Id: "Demand for investment goods",
  Is: "Supply of investment goods",
  Mh: "Bank deposits held by households",
  Ms: "Supply of bank deposits",
  Nd: "Demand for labor",
  Ns: "Supply of labor",
  W: "Wage rate",
  WBd: "Wage bill - demand",
  WBs: "Wage bill - supply",
  Y: "Income = GDP",
  YD: "Disposable income of households"
};

const BMW_EXTERNAL_DESCRIPTIONS: Record<string, string> = {
  alpha0: "Exogenous component in consumption",
  alpha1: "Propensity to consume out of income",
  alpha2: "Propensity to consume out of wealth",
  delta: "Depreciation rate",
  gamma: "Speed of adjustment of capital to its target value",
  kappa: "Capital-output ratio",
  pr: "Labor productivity",
  rl: "Rate of interest on bank loans, set exogenously"
};

const BMW_OPTIONS: SimulationOptions = {
  ...bmwBaselineOptions,
  periods: 50,
  solverMethod: "NEWTON",
  hiddenEquation: {
    leftVariable: "Ms",
    rightVariable: "Mh",
    tolerance: 1e-5
  }
};

const SCENARIO_1: ScenarioDefinition = {
  shocks: [
    {
      startPeriodInclusive: 5,
      endPeriodInclusive: 50,
      variables: {
        alpha0: { kind: "constant", value: 30 }
      }
    }
  ]
};

const SCENARIO_2: ScenarioDefinition = {
  shocks: [
    {
      startPeriodInclusive: 5,
      endPeriodInclusive: 50,
      variables: {
        alpha1: { kind: "constant", value: 0.7 }
      }
    }
  ]
};

const BMW_BALANCE_SHEET = {
  columns: ["Households", "Production firms", "Banks", "Sum"],
  rows: [
    { label: "Money deposits", values: ["+Mh", "", "-Ms", "0"] },
    { label: "Loans", values: ["", "-Ld", "+Ls", "0"] },
    { label: "Fixed capital", values: ["", "+K", "", "+K"] },
    { label: "Balance (net worth)", values: ["-Vh", "-V", "0", "0"] },
    { label: "Sum", values: ["0", "0", "0", "0"] }
  ],
  description:
    "Balance-sheet matrix for the BMW model, following the sfcr article presentation.",
  note: "Source structure adapted from the sfcr BMW article balance-sheet display."
};

const BMW_TRANSACTION_FLOW = {
  columns: [
    "Households",
    "Firms_current",
    "Firms_capital",
    "Banks_current",
    "Banks_capital"
  ],
  rows: [
    { label: "Consumption", values: ["-Cs", "+Cd", "", "", ""] },
    { label: "Investment", values: ["", "+Is", "-Id", "", ""] },
    { label: "Wages", values: ["+WBs", "-WBd", "", "", ""] },
    { label: "Depreciation", values: ["", "-AF", "+AF", "", ""] },
    {
      label: "Interest loans",
      values: ["", "-rl[-1] * Ld[-1]", "", "+rl[-1] * Ls[-1]", ""]
    },
    {
      label: "Interest on deposits",
      values: ["+rm[-1] * Mh[-1]", "", "", "-rm[-1] * Ms[-1]", ""]
    },
    { label: "Ch. loans", values: ["", "", "+d(Ld)", "", "-d(Ls)"] },
    { label: "Ch. deposits", values: ["-d(Mh)", "", "", "", "+d(Ms)"] }
  ],
  description:
    "Transactions-flow matrix for the BMW model, shown in the same accounting style as the sfcr article.",
  note: "Signs and row structure follow the BMW transactions-flow matrix in the sfcr article."
};

export function createBmwNotebook(): NotebookDocument {
  const bmwEditor = withEquationDescriptions(
    editorStateFromModel(bmwBaselineModel, BMW_OPTIONS, null),
    BMW_DESCRIPTIONS,
    BMW_EXTERNAL_DESCRIPTIONS
  );

  return {
    id: "bmw-notebook",
    title: "BMW Browser Notebook",
    metadata: {
      version: 1,
      template: "bmw"
    },
    cells: [
      {
        id: "intro",
        type: "markdown",
        title: "Overview",
        source:
          "This browser notebook adapts the BMW vignette into executable model, run, and chart cells. It focuses on a Newton baseline and two scenario comparisons."
      },
      {
        id: "balance-sheet",
        type: "matrix",
        title: "BMW balance sheet",
        sourceRunCellId: "baseline-newton",
        columns: [...BMW_BALANCE_SHEET.columns],
        rows: BMW_BALANCE_SHEET.rows.map((row) => ({
          label: row.label,
          values: [...row.values]
        })),
        description: BMW_BALANCE_SHEET.description,
        note: BMW_BALANCE_SHEET.note
      },
      {
        id: "transaction-flow",
        type: "matrix",
        title: "BMW transactions-flow matrix",
        sourceRunCellId: "baseline-newton",
        columns: [...BMW_TRANSACTION_FLOW.columns],
        rows: BMW_TRANSACTION_FLOW.rows.map((row) => ({
          label: row.label,
          values: [...row.values]
        })),
        description: BMW_TRANSACTION_FLOW.description,
        note: BMW_TRANSACTION_FLOW.note
      },
      {
        id: "transaction-flow-sequence",
        type: "sequence",
        title: "BMW transaction flow sequence",
        source: {
          kind: "matrix",
          matrixCellId: "transaction-flow"
        },
        description:
          "Canvas-rendered sequence view generated from the transactions-flow matrix at the selected simulation period.",
        note: "Use Reset and Next step to manually reveal flows in order."
      },
      {
        id: "equations-newton",
        type: "model",
        title: "BMW model with Newton solver",
        editor: bmwEditor
      },
      {
        id: "baseline-newton",
        type: "run",
        title: "Baseline run with Newton",
        sourceModelCellId: "equations-newton",
        mode: "baseline",
        resultKey: "bmw_newton",
        description:
          "This Newton baseline provides the reference path for the BMW scenarios."
      },
      {
        id: "baseline-chart",
        type: "chart",
        title: "Baseline headline variables",
        sourceRunCellId: "baseline-newton",
        variables: ["Y", "Cd", "Mh", "W"]
      },
      {
        id: "baseline-table",
        type: "table",
        title: "Baseline variable summary",
        sourceRunCellId: "baseline-newton",
        variables: ["Y", "Cd", "Id", "K", "Mh", "W"]
      },
      {
        id: "scenario-1-note",
        type: "markdown",
        title: "Scenario 1",
        source:
          "Scenario 1 increases autonomous consumption expenditure by raising alpha0 from period 5 to period 50."
      },
      {
        id: "scenario-1-run",
        type: "run",
        title: "Scenario 1: autonomous consumption shock",
        sourceModelCellId: "equations-newton",
        mode: "scenario",
        scenario: SCENARIO_1,
        resultKey: "bmw_s1"
      },
      {
        id: "scenario-1-chart",
        type: "chart",
        title: "Scenario 1 consumption and income",
        sourceRunCellId: "scenario-1-run",
        variables: ["Cd", "YD", "Id", "AF"]
      },
      {
        id: "scenario-2-note",
        type: "markdown",
        title: "Scenario 2",
        source:
          "Scenario 2 lowers alpha1 from period 5 to period 50 to examine the effect of a higher propensity to save."
      },
      {
        id: "scenario-2-run",
        type: "run",
        title: "Scenario 2: propensity-to-save shock",
        sourceModelCellId: "equations-newton",
        mode: "scenario",
        scenario: SCENARIO_2,
        resultKey: "bmw_s2"
      },
      {
        id: "scenario-2-chart",
        type: "chart",
        title: "Scenario 2 headline variables",
        sourceRunCellId: "scenario-2-run",
        variables: ["Cd", "YD", "W"]
      }
    ]
  };
}

function withEquationDescriptions<
  T extends {
    equations: Array<{ name: string; desc?: string }>;
    externals: Array<{ name: string; desc?: string }>;
  }
>(
  editor: T,
  equationDescriptions: Record<string, string>,
  externalDescriptions: Record<string, string>
): T {
  return {
    ...editor,
    equations: editor.equations.map((equation) => ({
      ...equation,
      desc: equationDescriptions[equation.name] ?? equation.desc ?? ""
    })),
    externals: editor.externals.map((external) => ({
      ...external,
      desc: externalDescriptions[external.name] ?? external.desc ?? ""
    }))
  };
}
