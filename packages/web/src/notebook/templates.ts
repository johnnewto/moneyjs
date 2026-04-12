import {
  bmwBaselineModel,
  bmwBaselineOptions,
  type ScenarioDefinition
} from "@sfcr/core";

import { editorStateFromModel } from "../lib/editorModel";
import type { NotebookDocument } from "./types";

const BMW_OPTIONS = {
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
} as const;

const BMW_TRANSACTION_FLOW = {
  columns: ["Current", "Capital", "Households", "Production firms", "Banks", "Sum"],
  rows: [
    { label: "Consumption", values: ["", "", "-Cd", "+Cs", "", "0"] },
    { label: "Investment", values: ["", "", "", "+Is", "", "+I"] },
    { label: "Wages", values: ["", "", "+WBs", "-WBd", "", "0"] },
    { label: "Depreciation allowance", values: ["", "", "", "+DA", "", "+DA"] },
    { label: "Interest on loans", values: ["", "", "", "-rl[-1] * Ld[-1]", "+rl[-1] * Ls[-1]", "0"] },
    { label: "Interest on deposits", values: ["", "", "+rm[-1] * Mh[-1]", "", "-rm[-1] * Mh[-1]", "0"] },
    { label: "Change in loans", values: ["", "", "", "+d(Ld)", "-d(Ls)", "0"] },
    { label: "Change in money deposits", values: ["", "", "-d(Mh)", "", "+d(Ms)", "0"] },
    { label: "Sum", values: ["0", "0", "0", "0", "0", "0"] }
  ],
  description:
    "Transactions-flow matrix for the BMW model, shown in the same accounting style as the sfcr article.",
  note: "Signs and row structure follow the BMW transactions-flow matrix in the sfcr article."
} as const;

export function createBmwNotebook(): NotebookDocument {
  const bmwEditor = editorStateFromModel(bmwBaselineModel, BMW_OPTIONS, null);

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
        ...BMW_BALANCE_SHEET
      },
      {
        id: "transaction-flow",
        type: "matrix",
        title: "BMW transactions-flow matrix",
        sourceRunCellId: "baseline-newton",
        ...BMW_TRANSACTION_FLOW
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
