import type { ChartAxisRange } from "../components/ResultChart";
import type { ScenarioDefinition, SimulationResult } from "@sfcr/core";

import type {
  EditorOptions,
  EditorState,
  EquationRow,
  ExternalRow,
  InitialValueRow,
  RuntimeDocument
} from "../lib/editorModel";

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
  id: string;
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
  collapsed?: boolean;
}

export interface SolverCell extends NotebookCellBase {
  type: "solver";
  modelId: string;
  options: EditorOptions;
  collapsed?: boolean;
}

export interface ExternalsCell extends NotebookCellBase {
  type: "externals";
  modelId: string;
  externals: ExternalRow[];
  collapsed?: boolean;
}

export interface InitialValuesCell extends NotebookCellBase {
  type: "initial-values";
  modelId: string;
  initialValues: InitialValueRow[];
  collapsed?: boolean;
}

export interface RunCell extends NotebookCellBase {
  type: "run";
  sourceModelCellId?: string;
  sourceModelId?: string;
  baselineRunCellId?: string;
  baselineStartPeriod?: number;
  mode: "baseline" | "scenario";
  scenario?: ScenarioDefinition | null;
  resultKey: string;
  description?: string;
  periods?: number;
}

export interface ChartCell extends NotebookCellBase {
  type: "chart";
  sourceRunCellId: string;
  variables: string[];
  axisMode?: "shared" | "separate";
  axisSnapTolarance?: number;
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
  sourceRunCellId?: string;
  rows: Array<{
    label: string;
    values: string[];
  }>;
  description?: string;
  note?: string;
}

export interface SequenceCell extends NotebookCellBase {
  type: "sequence";
  source: SequenceCellSource;
  description?: string;
  note?: string;
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
    };

export type NotebookCellOutput =
  | {
      type: "model";
      runtime: RuntimeDocument;
    }
  | {
      type: "result";
      result: SimulationResult;
    };

export interface NotebookRuntimeState {
  outputs: Record<string, NotebookCellOutput | undefined>;
  status: Record<string, "idle" | "running" | "success" | "error">;
  errors: Record<string, string | undefined>;
}
