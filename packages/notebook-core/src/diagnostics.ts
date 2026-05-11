export type NotebookDiagnosticSeverity = "error" | "warning";

export type NotebookDiagnosticDomain =
  | "source"
  | "schema"
  | "notebook"
  | "model"
  | "runtime"
  | "assistant"
  | "patch";

export interface NotebookDiagnosticLocation {
  column?: number;
  endOffset?: number;
  line?: number;
  offset?: number;
}

export interface NotebookDiagnostic {
  code?: string;
  domain: NotebookDiagnosticDomain;
  keyword?: string;
  location?: NotebookDiagnosticLocation;
  message: string;
  path?: string;
  phase?: string;
  relatedProperty?: string;
  schemaPath?: string;
  severity: NotebookDiagnosticSeverity;
}

export type NotebookDiagnosticInput = Omit<NotebookDiagnostic, "domain" | "severity"> & {
  domain?: NotebookDiagnosticDomain;
  severity?: NotebookDiagnosticSeverity;
};

export function createNotebookDiagnostic(
  input: NotebookDiagnosticInput,
  defaults: {
    domain: NotebookDiagnosticDomain;
    severity?: NotebookDiagnosticSeverity;
  }
): NotebookDiagnostic {
  return {
    ...input,
    domain: input.domain ?? defaults.domain,
    severity: input.severity ?? defaults.severity ?? "error"
  };
}

export function classifyNotebookDiagnostic(input: {
  domain?: NotebookDiagnosticDomain;
  keyword?: string;
  phase?: string;
  schemaPath?: string;
}): NotebookDiagnosticDomain {
  if (input.domain) {
    return input.domain;
  }
  if (input.phase === "parse") {
    return "source";
  }
  if (input.phase === "schema" || input.keyword || input.schemaPath) {
    return "schema";
  }
  return "notebook";
}

export function isBlockingNotebookDiagnostic(diagnostic: Pick<NotebookDiagnostic, "severity">): boolean {
  return diagnostic.severity === "error";
}

export function countNotebookDiagnosticsByDomain(
  diagnostics: readonly NotebookDiagnostic[]
): Partial<Record<NotebookDiagnosticDomain, number>> {
  return diagnostics.reduce<Partial<Record<NotebookDiagnosticDomain, number>>>((counts, diagnostic) => {
    counts[diagnostic.domain] = (counts[diagnostic.domain] ?? 0) + 1;
    return counts;
  }, {});
}
