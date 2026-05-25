import type {
  EquationRole,
  ExternalDef,
  ModelDefinition,
  ScenarioDefinition,
  ShockVariableDef,
  SimulationOptions,
  SimulationResult,
  SolverMethod
} from "@sfcr/core";

import type { NotebookScenarioDefinition } from "./document/scenarioFormat";
import type { UnitMeta } from "./unitMetaAliases";

export interface EquationRow {
  id: string;
  name: string;
  desc?: string;
  expression: string;
  role?: EquationRole;
  unitMeta?: UnitMeta;
}

export interface ExternalRow {
  id: string;
  name: string;
  desc?: string;
  kind: ExternalDef["kind"];
  valueText: string;
  unitMeta?: UnitMeta;
}

export interface InitialValueRow {
  id: string;
  name: string;
  valueText: string;
}

export interface ShockVariableRow {
  id: string;
  name: string;
  kind: ShockVariableDef["kind"];
  valueText: string;
}

export interface ShockRow {
  id: string;
  startPeriodInclusive: number;
  endPeriodInclusive: number;
  variables: ShockVariableRow[];
}

export interface EditorScenario {
  shocks: ShockRow[];
}

export interface EditorOptions {
  periods: number;
  solverMethod: SolverMethod;
  toleranceText: string;
  maxIterations: number;
  defaultInitialValueText: string;
  hiddenLeftVariable: string;
  hiddenRightVariable: string;
  hiddenToleranceText: string;
  relativeHiddenTolerance: boolean;
}

export interface EditorState {
  equations: EquationRow[];
  externals: ExternalRow[];
  initialValues: InitialValueRow[];
  options: EditorOptions;
  scenario: EditorScenario;
}

export interface RuntimeDocument {
  model: ModelDefinition;
  options: SimulationOptions;
  scenario: ScenarioDefinition | null;
}

export interface ChartAxisRange {
  includeZero?: boolean;
  max?: number;
  min?: number;
}

export interface NotebookDocument {
  id: string;
  title: string;
  cells: NotebookCell[];
  metadata: {
    version: 1;
    template?: string;
  };
}

export type NotebookCell =
  | MarkdownCell
  | ModelCell
  | EquationsCell
  | SolverCell
  | ExternalsCell
  | InitialValuesCell
  | RunCell
  | ChartCell
  | TableCell
  | MatrixCell
  | SequenceCell;

export interface NotebookCellBase {
  collapsed?: boolean;
  description?: string;
  id: string;
  note?: string;
  title: string;
}

export interface MarkdownCell extends NotebookCellBase {
  type: "markdown";
  source: string;
}

export interface ModelCell extends NotebookCellBase {
  type: "model";
  editor: EditorState;
}

export interface EquationsCell extends NotebookCellBase {
  type: "equations";
  modelId: string;
  equations: EquationRow[];
}

export interface SolverCell extends NotebookCellBase {
  type: "solver";
  modelId: string;
  options: EditorOptions;
}

export interface ExternalsCell extends NotebookCellBase {
  type: "externals";
  modelId: string;
  externals: ExternalRow[];
}

export interface InitialValuesCell extends NotebookCellBase {
  type: "initial-values";
  modelId: string;
  initialValues: InitialValueRow[];
}

export interface RunCell extends NotebookCellBase {
  type: "run";
  sourceModelCellId?: string;
  sourceModelId?: string;
  baselineRunCellId?: string;
  baselineStartPeriod?: number;
  mode: "baseline" | "scenario";
  scenario?: ScenarioDefinition | NotebookScenarioDefinition | null;
  resultKey: string;
  periods: number;
}

export interface ChartCell extends NotebookCellBase {
  type: "chart";
  sourceRunCellId: string;
  variables: string[];
  axisMode?: "shared" | "separate";
  axisSnapTolarance?: number;
  niceScale?: boolean;
  referenceTrace?: "none" | "baseline" | "previous-run";
  yAxisTickCount?: number;
  sharedRange?: ChartAxisRange;
  seriesRanges?: Record<string, ChartAxisRange | undefined>;
  timeRangeInclusive?: [number, number];
}

export interface TableCell extends NotebookCellBase {
  type: "table";
  sourceRunCellId: string;
  variables: string[];
}

export interface MatrixCell extends NotebookCellBase {
  type: "matrix";
  columns: string[];
  sectors?: string[];
  sourceRunCellId?: string;
  rows: Array<{
    band?: string;
    label: string;
    values: string[];
  }>;
}

export interface SequenceCell extends NotebookCellBase {
  type: "sequence";
  source: SequenceCellSource;
  participantColumnOrder?: string[];
}

export type SequenceCellSource =
  | {
      kind: "plantuml";
      source: string;
    }
  | {
      kind: "matrix";
      matrixCellId: string;
      sourceRunCellId?: string;
      includeZeroFlows?: boolean;
      aliases?: Record<string, string>;
    }
  | {
      kind: "dependency";
      modelId?: string;
      sourceModelId?: string;
      sourceModelCellId?: string;
      stripSectorSource?: "columns" | "sectors";
      showAccountingStrips?: boolean;
      ignoreInferredBandsForPlacement?: boolean;
      showExogenous?: boolean;
      showDebugOverlay?: boolean;
      stripMapping?: {
        transactionMatrixCellId?: string;
        balanceMatrixCellId?: string;
      };
    };

export type NotebookCellOutput =
  | {
      type: "model";
      runtime: RuntimeDocument;
    }
  | {
      type: "result";
      previousResult?: SimulationResult;
      result: SimulationResult;
    };

export interface NotebookRuntimeState {
  outputs: Record<string, NotebookCellOutput | undefined>;
  status: Record<string, "idle" | "running" | "success" | "error">;
  errors: Record<string, string | undefined>;
  historyUpdates?: Record<string, number | undefined>;
}
