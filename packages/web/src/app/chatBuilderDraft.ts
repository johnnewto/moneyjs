import { notebookFromJson } from "../notebook/document";
import { buildEditorStateForNotebookModel } from "../notebook/modelSections";
import type { NotebookDocument } from "../notebook/types";
import type {
  EditorOptions,
  EditorState,
  EquationRow,
  ExternalRow,
  InitialValueRow
} from "../lib/editorModel";

export const CHAT_BUILDER_SECTION_NAMES = [
  "Equations",
  "Solver options",
  "Externals",
  "Initial values",
  "Baseline run",
  "Chart preview"
];

export interface ChatBuilderDraftPlan {
  assistantText: string;
  equations: EquationRow[];
  externals: ExternalRow[];
  initialValues: InitialValueRow[];
  notebookDocument: NotebookDocument | null;
  sections: string[];
  solverOptions: Partial<EditorOptions> | null;
  summary: string;
}

const CHAT_BUILDER_DEFAULT_SOLVER_OPTIONS: EditorOptions = {
  periods: 100,
  solverMethod: "GAUSS_SEIDEL",
  toleranceText: "1e-15",
  maxIterations: 200,
  defaultInitialValueText: "1e-15",
  hiddenLeftVariable: "",
  hiddenRightVariable: "",
  hiddenToleranceText: "0.00001",
  relativeHiddenTolerance: false
};

export function normalizeChatBuilderDraftPlan(rawText: string): ChatBuilderDraftPlan {
  const notebookJson = extractJsonObjectText(rawText);
  if (notebookJson) {
    try {
      const notebookDocument = notebookFromJson(notebookJson);
      const editor = extractPrimaryEditorStateFromNotebook(notebookDocument);
      return {
        assistantText: `Generated notebook: ${notebookDocument.title}`,
        equations: editor?.equations ?? [],
        externals: editor?.externals ?? [],
        initialValues: editor?.initialValues ?? [],
        notebookDocument,
        summary: summarizeNotebookDocument(notebookDocument),
        sections: inferNotebookSections(notebookDocument),
        solverOptions: editor?.options ?? null
      };
    } catch {
      // Fall through to legacy draft-plan parsing.
    }
  }

  try {
    const parsed = JSON.parse(rawText) as {
      assistantText?: unknown;
      equations?: unknown;
      externals?: unknown;
      initialValues?: unknown;
      summary?: unknown;
      sections?: unknown;
      solverOptions?: unknown;
    };

    const assistantText =
      typeof parsed.assistantText === "string" && parsed.assistantText.trim() !== ""
        ? parsed.assistantText.trim()
        : typeof parsed.summary === "string" && parsed.summary.trim() !== ""
          ? parsed.summary.trim()
          : rawText;

    const summary =
      typeof parsed.summary === "string" && parsed.summary.trim() !== ""
        ? parsed.summary.trim()
        : assistantText;

    const sections = Array.isArray(parsed.sections)
      ? parsed.sections
          .filter((value): value is string => typeof value === "string")
          .map((value) => value.trim())
          .filter((value) => value !== "")
      : [];

    const equations = Array.isArray(parsed.equations)
      ? parsed.equations.flatMap((entry, index) => normalizeDraftEquation(entry, index))
      : [];

    const externals = Array.isArray(parsed.externals)
      ? parsed.externals.flatMap((entry, index) => normalizeDraftExternal(entry, index))
      : [];

    const initialValues = Array.isArray(parsed.initialValues)
      ? parsed.initialValues.flatMap((entry, index) => normalizeDraftInitialValue(entry, index))
      : [];

    const solverOptions = normalizeDraftSolverOptions(parsed.solverOptions);

    return {
      assistantText,
      equations,
      externals,
      initialValues,
      notebookDocument: null,
      summary,
      sections: sections.length > 0 ? sections : inferDraftSections({ equations, externals, initialValues, solverOptions }),
      solverOptions
    };
  } catch {
    return {
      assistantText: rawText,
      equations: [],
      externals: [],
      initialValues: [],
      notebookDocument: null,
      summary: rawText,
      sections: CHAT_BUILDER_SECTION_NAMES,
      solverOptions: null
    };
  }
}

function extractJsonObjectText(rawText: string): string | null {
  const trimmed = rawText.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  const candidate = fenceMatch?.[1]?.trim() ?? trimmed;

  if (candidate.startsWith("{") && candidate.endsWith("}")) {
    return candidate;
  }

  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return candidate.slice(start, end + 1);
  }

  return null;
}

function extractPrimaryEditorStateFromNotebook(document: NotebookDocument): EditorState | null {
  const runCell = document.cells.find((cell) => cell.type === "run");
  if (runCell?.type === "run") {
    const editor = buildEditorStateForNotebookModel(document, runCell);
    if (editor) {
      return editor;
    }
  }

  const equationsCell = document.cells.find((cell) => cell.type === "equations");
  if (equationsCell?.type === "equations") {
    return buildEditorStateForNotebookModel(document, { modelId: equationsCell.modelId });
  }

  const legacyModelCell = document.cells.find((cell) => cell.type === "model");
  return legacyModelCell?.type === "model" ? legacyModelCell.editor : null;
}

function inferNotebookSections(document: NotebookDocument): string[] {
  const sections = document.cells.map((cell) => cell.title.trim()).filter(Boolean);
  return sections.length > 0 ? sections : CHAT_BUILDER_SECTION_NAMES;
}

function summarizeNotebookDocument(document: NotebookDocument): string {
  const counts = document.cells.reduce(
    (current, cell) => ({
      ...current,
      [cell.type]: (current[cell.type] ?? 0) + 1
    }),
    {} as Record<string, number>
  );
  const parts = [
    `${document.cells.length} cells`,
    counts.matrix ? `${counts.matrix} matrix cells` : null,
    counts.sequence ? `${counts.sequence} sequence cells` : null,
    counts.equations ? `${counts.equations} equation cells` : null,
    counts.run ? `${counts.run} run cells` : null
  ].filter((part): part is string => Boolean(part));

  return `${document.title} (${parts.join(", ")}).`;
}

function normalizeDraftEquation(entry: unknown, index: number): EquationRow[] {
  if (!entry || typeof entry !== "object") {
    return [];
  }

  const candidate = entry as Partial<EquationRow>;
  if (typeof candidate.name !== "string" || typeof candidate.expression !== "string") {
    return [];
  }

  return [
    {
      id: typeof candidate.id === "string" && candidate.id.trim() !== "" ? candidate.id : `draft-eq-${index}-${candidate.name.trim()}`,
      name: candidate.name.trim(),
      expression: candidate.expression.trim(),
      ...(typeof candidate.desc === "string" && candidate.desc.trim() !== "" ? { desc: candidate.desc.trim() } : {}),
      ...(typeof candidate.role === "string" ? { role: candidate.role as EquationRow["role"] } : {})
    }
  ];
}

function normalizeDraftExternal(entry: unknown, index: number): ExternalRow[] {
  if (!entry || typeof entry !== "object") {
    return [];
  }

  const candidate = entry as Partial<ExternalRow>;
  if (typeof candidate.name !== "string" || typeof candidate.valueText !== "string") {
    return [];
  }

  const kind = candidate.kind === "series" ? "series" : "constant";

  return [
    {
      id: typeof candidate.id === "string" && candidate.id.trim() !== "" ? candidate.id : `draft-ext-${index}-${candidate.name.trim()}`,
      name: candidate.name.trim(),
      kind,
      valueText: candidate.valueText.trim(),
      ...(typeof candidate.desc === "string" && candidate.desc.trim() !== "" ? { desc: candidate.desc.trim() } : {})
    }
  ];
}

function normalizeDraftInitialValue(entry: unknown, index: number): InitialValueRow[] {
  if (!entry || typeof entry !== "object") {
    return [];
  }

  const candidate = entry as Partial<InitialValueRow>;
  if (typeof candidate.name !== "string" || typeof candidate.valueText !== "string") {
    return [];
  }

  return [
    {
      id: typeof candidate.id === "string" && candidate.id.trim() !== "" ? candidate.id : `draft-init-${index}-${candidate.name.trim()}`,
      name: candidate.name.trim(),
      valueText: candidate.valueText.trim()
    }
  ];
}

function normalizeDraftSolverOptions(entry: unknown): Partial<EditorOptions> | null {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const candidate = entry as Partial<EditorOptions>;
  const next: Partial<EditorOptions> = {};

  if (typeof candidate.periods === "number") {
    next.periods = candidate.periods;
  }
  if (typeof candidate.solverMethod === "string") {
    next.solverMethod = candidate.solverMethod as EditorOptions["solverMethod"];
  }
  if (typeof candidate.toleranceText === "string") {
    next.toleranceText = candidate.toleranceText;
  }
  if (typeof candidate.maxIterations === "number") {
    next.maxIterations = candidate.maxIterations;
  }
  if (typeof candidate.defaultInitialValueText === "string") {
    next.defaultInitialValueText = candidate.defaultInitialValueText;
  }
  if (typeof candidate.hiddenLeftVariable === "string") {
    next.hiddenLeftVariable = candidate.hiddenLeftVariable;
  }
  if (typeof candidate.hiddenRightVariable === "string") {
    next.hiddenRightVariable = candidate.hiddenRightVariable;
  }
  if (typeof candidate.hiddenToleranceText === "string") {
    next.hiddenToleranceText = candidate.hiddenToleranceText;
  }
  if (typeof candidate.relativeHiddenTolerance === "boolean") {
    next.relativeHiddenTolerance = candidate.relativeHiddenTolerance;
  }

  return Object.keys(next).length > 0 ? next : null;
}

function inferDraftSections(args: {
  equations: EquationRow[];
  externals: ExternalRow[];
  initialValues: InitialValueRow[];
  solverOptions: Partial<EditorOptions> | null;
}): string[] {
  const sections: string[] = [];

  if (args.equations.length > 0) {
    sections.push("Equations");
  }
  if (args.solverOptions) {
    sections.push("Solver options");
  }
  if (args.externals.length > 0) {
    sections.push("Externals");
  }
  if (args.initialValues.length > 0) {
    sections.push("Initial values");
  }

  return sections.length > 0 ? sections : CHAT_BUILDER_SECTION_NAMES;
}

export function buildDraftEditorState(args: {
  equations: EquationRow[];
  externals: ExternalRow[];
  initialValues: InitialValueRow[];
  solverOptions: Partial<EditorOptions> | null;
}): EditorState | null {
  if (
    args.equations.length === 0 &&
    args.externals.length === 0 &&
    args.initialValues.length === 0 &&
    !args.solverOptions
  ) {
    return null;
  }

  return {
    equations: args.equations,
    externals: args.externals,
    initialValues: args.initialValues,
    options: {
      ...CHAT_BUILDER_DEFAULT_SOLVER_OPTIONS,
      ...(args.solverOptions ?? {})
    },
    scenario: { shocks: [] }
  };
}

function slugifyChatBuilderText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "chat-builder-draft";
}

export function buildDraftNotebookDocument(args: {
  editor: EditorState;
  draftFocus: string;
  summary: string;
}): NotebookDocument {
  const notebookId = slugifyChatBuilderText(args.draftFocus || args.summary);
  const modelId = `${notebookId}-model`;
  const runCellId = `${notebookId}-baseline-run`;
  const chartVariables = args.editor.equations.slice(0, 3).map((equation) => equation.name);

  return {
    id: notebookId,
    title: `Chat Builder Draft: ${args.draftFocus || "SFC model"}`,
    metadata: { version: 1 },
    cells: [
      {
        id: `${notebookId}-overview`,
        type: "markdown",
        title: "Overview",
        source: args.summary
      },
      {
        id: `${notebookId}-equations`,
        type: "equations",
        title: "Equations",
        modelId,
        equations: args.editor.equations
      },
      {
        id: `${notebookId}-solver`,
        type: "solver",
        title: "Solver options",
        modelId,
        options: args.editor.options
      },
      {
        id: `${notebookId}-externals`,
        type: "externals",
        title: "Externals",
        modelId,
        externals: args.editor.externals
      },
      {
        id: `${notebookId}-initial-values`,
        type: "initial-values",
        title: "Initial values",
        modelId,
        initialValues: args.editor.initialValues
      },
      {
        id: runCellId,
        type: "run",
        title: "Baseline run",
        mode: "baseline",
        resultKey: `${notebookId}_baseline`,
        sourceModelId: modelId,
        description: args.summary
      },
      {
        id: `${notebookId}-baseline-chart`,
        type: "chart",
        title: "Baseline chart",
        sourceRunCellId: runCellId,
        variables: chartVariables
      }
    ]
  };
}
