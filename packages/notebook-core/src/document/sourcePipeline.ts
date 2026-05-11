import { createNotebookDiagnostic, type NotebookDiagnostic, type NotebookDiagnosticDomain } from "../diagnostics";

export type NotebookSourceFormat = "json" | "markdown";

export const SUPPORTED_NOTEBOOK_SOURCE_FORMATS: readonly NotebookSourceFormat[] = [
  "json",
  "markdown"
];

export interface NotebookSourceDiagnostic extends NotebookDiagnostic {
  column?: number;
  endOffset?: number;
  line?: number;
  offset?: number;
  phase: "parse" | "schema";
}

export interface NotebookSourceAnalysis<Document> {
  document: Document | null;
  format: NotebookSourceFormat;
  parseDiagnostics: NotebookSourceDiagnostic[];
  schemaDiagnostics: NotebookSourceDiagnostic[];
}

export interface NotebookSourceParseSuccess<Parsed> {
  ok: true;
  parsed: Parsed;
  schemaTarget: unknown;
}

export interface NotebookSourceParseFailure {
  diagnostics: NotebookSourceDiagnostic[];
  ok: false;
}

export interface NotebookSourcePipeline<Parsed, Document> {
  buildDocument(parsed: Parsed): Document;
  detectFormat(source: string): NotebookSourceFormat;
  fallbackFormat: NotebookSourceFormat;
  formatLabel(format: NotebookSourceFormat): "JSON" | "Markdown";
  locateSchemaDiagnostic(args: {
    allIssues: Array<{ keyword?: string; path?: string; relatedProperty?: string }>;
    format: NotebookSourceFormat;
    issue: { keyword?: string; path?: string; relatedProperty?: string };
    source: string;
  }): Pick<NotebookSourceDiagnostic, "column" | "endOffset" | "line" | "offset">;
  parseSource(
    source: string,
    format: NotebookSourceFormat
  ): NotebookSourceParseSuccess<Parsed> | NotebookSourceParseFailure;
  validateSchema(schemaTarget: unknown): Array<{
    domain?: NotebookDiagnosticDomain;
    keyword?: string;
    message: string;
    path?: string;
    relatedProperty?: string;
  }>;
}

export function analyzeNotebookSourceWithPipeline<Parsed, Document>(
  source: string,
  preferredFormat: NotebookSourceFormat | undefined,
  pipeline: NotebookSourcePipeline<Parsed, Document>
): NotebookSourceAnalysis<Document> {
  const detectedFormat = resolveNotebookSourceFormat(source, preferredFormat, pipeline);
  if (!detectedFormat.ok) {
    return {
      document: null,
      format: preferredFormat ?? pipeline.fallbackFormat,
      parseDiagnostics: [
        createNotebookSourceDiagnostic({
          message: detectedFormat.message,
          phase: "parse"
        })
      ],
      schemaDiagnostics: []
    };
  }

  const format = detectedFormat.format;
  const parsed = pipeline.parseSource(source, format);

  if (!parsed.ok) {
    return {
      document: null,
      format,
      parseDiagnostics: parsed.diagnostics,
      schemaDiagnostics: []
    };
  }

  const schemaIssues = pipeline.validateSchema(parsed.schemaTarget);
  const schemaDiagnostics = schemaIssues.map((issue) => {
    const location = pipeline.locateSchemaDiagnostic({
      allIssues: schemaIssues,
      format,
      issue,
      source
    });
    return createNotebookSourceDiagnostic({
      message: `Notebook ${pipeline.formatLabel(format)} schema validation failed: ${issue.message}`,
      domain: issue.domain ?? "schema",
      path: issue.path,
      phase: "schema",
      ...location
    });
  });

  return {
    document: schemaDiagnostics.length === 0 ? pipeline.buildDocument(parsed.parsed) : null,
    format,
    parseDiagnostics: [],
    schemaDiagnostics
  };
}

export function createNotebookSourceDiagnostic(input: {
  column?: number;
  domain?: NotebookDiagnosticDomain;
  endOffset?: number;
  line?: number;
  message: string;
  offset?: number;
  path?: string;
  phase: "parse" | "schema";
}): NotebookSourceDiagnostic {
  const location = {
    column: input.column,
    endOffset: input.endOffset,
    line: input.line,
    offset: input.offset
  };
  const diagnostic = createNotebookDiagnostic(
    {
      location,
      message: input.message,
      path: input.path,
      phase: input.phase
    },
    { domain: input.domain ?? (input.phase === "parse" ? "source" : "schema") }
  );
  return {
    ...diagnostic,
    column: input.column,
    endOffset: input.endOffset,
    line: input.line,
    offset: input.offset,
    phase: input.phase
  };
}

export function parseNotebookSourceWithPipeline<Parsed, Document>(
  source: string,
  preferredFormat: NotebookSourceFormat | undefined,
  pipeline: NotebookSourcePipeline<Parsed, Document>
): { document: Document; format: NotebookSourceFormat } {
  const analysis = analyzeNotebookSourceWithPipeline(source, preferredFormat, pipeline);
  if (!analysis.document) {
    throw new Error(analysis.parseDiagnostics[0]?.message ?? analysis.schemaDiagnostics[0]?.message);
  }

  return {
    document: analysis.document,
    format: analysis.format
  };
}

function resolveNotebookSourceFormat<Parsed, Document>(
  source: string,
  preferredFormat: NotebookSourceFormat | undefined,
  pipeline: NotebookSourcePipeline<Parsed, Document>
): { format: NotebookSourceFormat; ok: true } | { message: string; ok: false } {
  if (preferredFormat) {
    return { format: preferredFormat, ok: true };
  }

  try {
    return { format: pipeline.detectFormat(source), ok: true };
  } catch (error) {
    return {
      message:
        error instanceof Error
          ? error.message
          : "Unable to detect notebook format. Expected JSON or Markdown.",
      ok: false
    };
  }
}
