import {
  analyzeNotebookSource,
  createNotebookSourceDiagnostic,
  notebookToJson,
  notebookToCompactYaml,
  notebookToMarkdown,
  type NotebookSourceDiagnostic,
  type NotebookSourceFormat
} from "./document";
import { buildEditorStateForNotebookModel } from "./modelSections";
import { validateNotebookDocument } from "./validation";
import type {
  EquationsCell,
  ExternalsCell,
  InitialValuesCell,
  ModelCell,
  NotebookCell,
  NotebookDocument,
  SolverCell
} from "./types";
import { diagnoseBuildRuntime, validateEditorState, type EditorState } from "../lib/editorModel";

export interface NotebookSourceValidation {
  canApply: boolean;
  diagnostics: NotebookSourceDiagnostic[];
  document: NotebookDocument | null;
  issues: string[];
  modelIssueCount: number;
  notebookIssueCount: number;
  parse: ValidationStep;
  schema: ValidationStep;
}

export interface ValidationStep {
  message: string;
  status: "valid" | "invalid";
}

export function inferFormatFromFileName(fileName: string): NotebookSourceFormat | null {
  const normalized = fileName.toLowerCase();
  if (normalized.endsWith(".json")) {
    return "json";
  }
  if (normalized.endsWith(".md") || normalized.endsWith(".markdown")) {
    return "markdown";
  }
  if (normalized.endsWith(".yaml") || normalized.endsWith(".yml")) {
    return "yaml";
  }
  return null;
}

export function serializeNotebookSource(
  document: NotebookDocument,
  format: NotebookSourceFormat
): string {
  if (format === "json") {
    return notebookToJson(document);
  }
  if (format === "yaml") {
    return notebookToCompactYaml(document, { preserveIds: true });
  }
  return notebookToMarkdown(document);
}

export function formatNotebookSourceLabel(format: NotebookSourceFormat): string {
  if (format === "json") {
    return "JSON";
  }
  if (format === "yaml") {
    return "YAML";
  }
  return "Markdown";
}

export function getNotebookSourceMimeType(format: NotebookSourceFormat): string {
  if (format === "json") {
    return "application/json";
  }
  if (format === "yaml") {
    return "application/yaml";
  }
  return "text/markdown";
}

export function getNotebookSourceFileSuffix(format: NotebookSourceFormat): string {
  if (format === "json") {
    return "sfnb.json";
  }
  if (format === "yaml") {
    return "notebook.yaml";
  }
  return "sfnb.md";
}

export function getNotebookSourcePlaceholder(format: NotebookSourceFormat): string {
  if (format === "json") {
    return "Paste a notebook JSON document";
  }
  if (format === "yaml") {
    return "Paste a notebook YAML document with format and formatVersion headers";
  }
  return "Paste notebook Markdown with headings and fenced sfcr-* blocks";
}

export function buildNotebookSourceValidation(
  source: string,
  format: NotebookSourceFormat
): NotebookSourceValidation {
  if (!source.trim()) {
    return {
      canApply: false,
      diagnostics: [
        {
          ...createNotebookSourceDiagnostic({
            message: "Source is empty.",
            phase: "parse"
          }),
          message: "Source is empty.",
          phase: "parse"
        }
      ],
      document: null,
      issues: ["Source is empty."],
      modelIssueCount: 0,
      notebookIssueCount: 0,
      parse: { status: "invalid", message: "empty" },
      schema: { status: "invalid", message: "not checked" }
    };
  }

  const analysis = analyzeNotebookSource(source, format);
  if (analysis.parseDiagnostics.length > 0) {
    return {
      canApply: false,
      diagnostics: analysis.parseDiagnostics,
      document: null,
      issues: analysis.parseDiagnostics.map((issue) => issue.message),
      modelIssueCount: 0,
      notebookIssueCount: 0,
      parse: { status: "invalid", message: "invalid" },
      schema: { status: "invalid", message: "not checked" }
    };
  }

  if (analysis.schemaDiagnostics.length > 0) {
    return {
      canApply: false,
      diagnostics: analysis.schemaDiagnostics,
      document: null,
      issues: analysis.schemaDiagnostics.map((issue) => issue.message),
      modelIssueCount: 0,
      notebookIssueCount: 0,
      parse: { status: "valid", message: "valid" },
      schema: { status: "invalid", message: "invalid" }
    };
  }

  if (!analysis.document) {
    return {
      canApply: false,
      diagnostics: [
        {
          ...createNotebookSourceDiagnostic({
            message: "Unable to parse source.",
            phase: "parse"
          }),
          message: "Unable to parse source.",
          phase: "parse"
        }
      ],
      document: null,
      issues: ["Unable to parse source."],
      modelIssueCount: 0,
      notebookIssueCount: 0,
      parse: { status: "invalid", message: "invalid" },
      schema: { status: "invalid", message: "not checked" }
    };
  }

  const notebookIssues = validateNotebookDocument(analysis.document);
  const modelValidation = validateNotebookModels(analysis.document);
  const diagnostics: NotebookSourceDiagnostic[] = [
    ...notebookIssues.map((issue) => createNotebookSourceDiagnostic({
      domain: issue.domain,
      message: issue.message,
      path: issue.path,
      phase: "schema"
    })),
    ...modelValidation.issues
  ];
  const issues = diagnostics.map((issue) => issue.message);

  return {
    canApply: issues.length === 0,
    diagnostics,
    document: analysis.document,
    issues,
    modelIssueCount: modelValidation.issueCount,
    notebookIssueCount: notebookIssues.length,
    parse: { status: "valid", message: "valid" },
    schema: { status: "valid", message: "valid" }
  };
}

export function validateNotebookModels(document: NotebookDocument): {
  issueCount: number;
  issues: NotebookSourceDiagnostic[];
  modelCount: number;
} {
  const legacyEditors = document.cells
    .filter((cell): cell is ModelCell => cell.type === "model")
    .map((cell) => ({ editor: cell.editor, label: `Model cell \"${cell.title}\"` }));
  const modelIds = Array.from(
    new Set(
      document.cells
        .filter(
          (
            cell
          ): cell is EquationsCell | SolverCell | ExternalsCell | InitialValuesCell =>
            cell.type === "equations" ||
            cell.type === "solver" ||
            cell.type === "externals" ||
            cell.type === "initial-values"
        )
        .map((cell) => cell.modelId)
    )
  );
  const splitEditors = modelIds
    .map((modelId) => {
      const editor = buildEditorStateForNotebookModel(document, { modelId });
      if (!editor) {
        return null;
      }

      return { editor, label: `Model \"${modelId}\"` };
    })
    .filter((entry): entry is { editor: EditorState; label: string } => entry != null);
  const editors = [...legacyEditors, ...splitEditors];
  const issues = editors.flatMap(({ editor, label }) => {
    const editorIssues = validateEditorState(editor).map((issue) => ({
      ...createNotebookSourceDiagnostic({
        domain: "model",
        message: formatModelValidationIssue(label, issue.path, issue.message),
        path: issue.path,
        phase: "schema"
      }),
      message: formatModelValidationIssue(label, issue.path, issue.message),
      path: issue.path,
      phase: "schema" as const
    }));
    const runtimeIssues = diagnoseBuildRuntime(editor).issues.map((issue) => ({
      ...createNotebookSourceDiagnostic({
        domain: "runtime",
        message: formatModelValidationIssue(label, issue.path, issue.message),
        path: issue.path,
        phase: "schema"
      }),
      message: formatModelValidationIssue(label, issue.path, issue.message),
      path: issue.path,
      phase: "schema" as const
    }));

    return [...editorIssues, ...runtimeIssues];
  });

  return { issueCount: issues.length, issues, modelCount: editors.length };
}

function formatModelValidationIssue(modelLabel: string, path: string, message: string): string {
  return `${modelLabel} ${path}: ${message}`;
}

export function summarizeCellTypes(cells: NotebookCell[]): string {
  const counts = cells.reduce<Record<string, number>>((accumulator, cell) => {
    accumulator[cell.type] = (accumulator[cell.type] ?? 0) + 1;
    return accumulator;
  }, {});

  return Object.entries(counts)
    .map(([type, count]) => `${type} (${count})`)
    .join(", ");
}
