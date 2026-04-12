import type { ScenarioDefinition, SimulationResult } from "@sfcr/core";

import type { EditorState, RuntimeDocument } from "../lib/editorModel";

export interface NotebookDocument {
  id: string;
  title: string;
  cells: NotebookCell[];
  metadata: {
    version: 1;
    template?: "bmw";
  };
}

export type NotebookCell =
  | MarkdownCell
  | ModelCell
  | RunCell
  | ChartCell
  | TableCell
  | MatrixCell;

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

export interface RunCell extends NotebookCellBase {
  type: "run";
  sourceModelCellId: string;
  mode: "baseline" | "scenario";
  scenario?: ScenarioDefinition | null;
  resultKey: string;
  description?: string;
}

export interface ChartCell extends NotebookCellBase {
  type: "chart";
  sourceRunCellId: string;
  variables: string[];
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
