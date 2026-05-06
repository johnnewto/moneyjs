import type { NotebookCell, NotebookDocument } from "./types";
import { stringifyJsonWithCompactLeaves } from "../lib/jsonFormat";
import { validateNotebookSchemaObject, type NotebookValidationIssue } from "./validation";

export type NotebookSourceFormat = "json" | "markdown";

export interface NotebookSourceDiagnostic {
  column?: number;
  endOffset?: number;
  line?: number;
  message: string;
  offset?: number;
  path?: string;
  phase: "parse" | "schema";
}

export interface NotebookSourceAnalysis {
  document: NotebookDocument | null;
  format: NotebookSourceFormat;
  parseDiagnostics: NotebookSourceDiagnostic[];
  schemaDiagnostics: NotebookSourceDiagnostic[];
}

export function notebookToJson(document: NotebookDocument): string {
  return stringifyJsonWithCompactLeaves(serializeNotebookDocument(document));
}

export function notebookToMarkdown(document: NotebookDocument): string {
  const lines: string[] = [`# ${document.title}`, ""];

  document.cells.forEach((cell, index) => {
    if (cell.type === "markdown") {
      lines.push(`## ${cell.title}`);
      lines.push("");
      lines.push(cell.source.trim());
      lines.push("");
      return;
    }

    lines.push(`## ${cell.title}`);
    lines.push("");
    lines.push(`\`\`\`sfcr-${cell.type}`);
    lines.push(stringifyJsonWithCompactLeaves(serializeNotebookCell(cell)));
    lines.push("```");
    lines.push("");

    if (index === document.cells.length - 1) {
      lines.push("");
    }
  });

  return lines.join("\n").trim();
}

export function notebookFromJson(source: string): NotebookDocument {
  const parsed = JSON.parse(source) as Partial<NotebookDocument>;
  const normalized = normalizeNotebookObject(parsed, "JSON");
  const issues = validateNotebookSchemaObject(serializeNotebookDocument(normalized));
  if (issues.length === 0) {
    return normalized;
  }

  throw new Error(`Notebook JSON schema validation failed: ${issues[0].message}`);
}
function normalizeNotebookObject(
  parsed: Partial<NotebookDocument>,
  formatLabel: "JSON"
): NotebookDocument {
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`Notebook ${formatLabel} must be an object.`);
  }
  if (typeof parsed.id !== "string" || typeof parsed.title !== "string") {
    throw new Error(`Notebook ${formatLabel} must contain string id and title fields.`);
  }
  if (!Array.isArray(parsed.cells)) {
    throw new Error(`Notebook ${formatLabel} must contain a cells array.`);
  }

  parsed.cells.forEach(validateCell);

  return normalizeNotebookDocument(parsed as NotebookDocument);
}

export function notebookFromMarkdown(source: string): NotebookDocument {
  const analysis = analyzeNotebookSource(source, "markdown");
  if (analysis.document) {
    return analysis.document;
  }

  throw new Error(analysis.parseDiagnostics[0]?.message ?? analysis.schemaDiagnostics[0]?.message);
}

function parseMarkdownNotebook(source: string): NotebookDocument {
  const normalized = source.replace(/\r\n/g, "\n").trim();
  const titleMatch = normalized.match(/^#\s+(.+)$/m);
  if (!titleMatch) {
    throw new Error("Notebook Markdown must start with a '# Title' heading.");
  }

  const title = titleMatch[1].trim();
  const content = normalized.slice(titleMatch.index! + titleMatch[0].length).trim();
  const sections = splitMarkdownSections(content);
  const cells: NotebookCell[] = [];
  let markdownIndex = 0;

  for (const section of sections) {
    const cellTitle = section.title;
    const body = section.body.trim();
    const fenceMatch = body.match(/^```sfcr-([a-z-]+)\n([\s\S]*?)\n```$/);

    if (fenceMatch) {
      const cell = JSON.parse(fenceMatch[2]) as NotebookCell;
      validateCell(cell);
      cells.push(normalizeNotebookCell(cell));
    } else if (body) {
      markdownIndex += 1;
      cells.push({
        id: `markdown-${markdownIndex}`,
        type: "markdown",
        title: cellTitle,
        source: body
      });
    }
  }

  if (cells.length === 0) {
    throw new Error("Notebook Markdown did not contain any cells.");
  }

  const document: NotebookDocument = {
    id: slugifyTitle(title),
    title,
    metadata: { version: 1 },
    cells
  };

  return document;
}

export function serializeNotebookCell(cell: NotebookCell): NotebookCell {
  if (cell.type !== "run" || !cell.scenario) {
    return structuredClone(cell);
  }

  return {
    ...cell,
    scenario: {
      ...cell.scenario,
      shocks: cell.scenario.shocks.map((shock) => {
        const { startPeriodInclusive, endPeriodInclusive, ...rest } = shock;
        return {
          ...rest,
          rangeInclusive: [startPeriodInclusive, endPeriodInclusive]
        };
      })
    }
  } as unknown as NotebookCell;
}

function serializeNotebookDocument(document: NotebookDocument): NotebookDocument {
  return {
    ...document,
    cells: document.cells.map(serializeNotebookCell)
  };
}

function normalizeNotebookDocument(document: NotebookDocument): NotebookDocument {
  return {
    ...document,
    cells: document.cells.map(normalizeNotebookCell)
  };
}

function normalizeNotebookCell(cell: NotebookCell): NotebookCell {
  if (cell.type !== "run" || !cell.scenario) {
    return cell;
  }

  return {
    ...cell,
    scenario: {
      ...cell.scenario,
      shocks: cell.scenario.shocks.map((shock) => {
        const candidate = shock as typeof shock & { rangeInclusive?: [number, number] };
        const start = candidate.rangeInclusive?.[0] ?? shock.startPeriodInclusive;
        const end = candidate.rangeInclusive?.[1] ?? shock.endPeriodInclusive;
        return {
          ...shock,
          startPeriodInclusive: start,
          endPeriodInclusive: end
        };
      })
    }
  };
}

export function detectNotebookSourceFormat(source: string): NotebookSourceFormat {
  const normalized = source.trimStart();
  if (normalized.startsWith("{") || normalized.startsWith("[")) {
    return "json";
  }
  if (normalized.startsWith("#")) {
    return "markdown";
  }
  throw new Error("Unable to detect notebook format. Expected JSON or Markdown.");
}

export function parseNotebookSource(
  source: string,
  preferredFormat?: NotebookSourceFormat
): { document: NotebookDocument; format: NotebookSourceFormat } {
  const analysis = analyzeNotebookSource(source, preferredFormat);
  if (!analysis.document) {
    throw new Error(analysis.parseDiagnostics[0]?.message ?? analysis.schemaDiagnostics[0]?.message);
  }

  return {
    document: analysis.document,
    format: analysis.format
  };
}

export function analyzeNotebookSource(
  source: string,
  preferredFormat?: NotebookSourceFormat
): NotebookSourceAnalysis {
  const detectedFormat = resolveNotebookSourceFormat(source, preferredFormat);
  if (!detectedFormat.ok) {
    return {
      document: null,
      format: preferredFormat ?? "json",
      parseDiagnostics: [
        {
          message: detectedFormat.message,
          phase: "parse"
        }
      ],
      schemaDiagnostics: []
    };
  }

  const format = detectedFormat.format;
  const parsed =
    format === "json"
      ? parseJsonNotebookSource(source)
      : parseMarkdownNotebookSource(source);

  if (!parsed.ok) {
    return {
      document: null,
      format,
      parseDiagnostics: parsed.diagnostics,
      schemaDiagnostics: []
    };
  }

  const schemaTarget = "document" in parsed ? serializeNotebookDocument(parsed.document) : parsed.value;
  const schemaIssues = validateNotebookSchemaObject(schemaTarget);
  const schemaDiagnostics = schemaIssues.map((issue) => {
      const location = locateSchemaDiagnosticInSource(source, format, issue, schemaIssues);
      return {
        ...location,
        message: `Notebook ${formatLabelForSourceFormat(format)} schema validation failed: ${issue.message}`,
        path: issue.path,
        phase: "schema" as const
      };
    });

  return {
    document:
      schemaDiagnostics.length === 0
        ? "document" in parsed
          ? parsed.document
          : normalizeNotebookObject(parsed.value, "JSON")
        : null,
    format,
    parseDiagnostics: [],
    schemaDiagnostics
  };
}

function parseJsonNotebookSource(
  source: string
):
  | { ok: true; value: Partial<NotebookDocument> }
  | { diagnostics: NotebookSourceDiagnostic[]; ok: false } {
  try {
    const parsed = JSON.parse(source) as Partial<NotebookDocument>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        diagnostics: [
          {
            message: "Notebook JSON must be an object.",
            phase: "parse"
          }
        ],
        ok: false
      };
    }

    return { ok: true, value: parsed };
  } catch (error) {
    return {
      diagnostics: [buildJsonParseDiagnostic(source, error)],
      ok: false
    };
  }
}

function parseMarkdownNotebookSource(
  source: string
):
  | { document: NotebookDocument; ok: true }
  | { diagnostics: NotebookSourceDiagnostic[]; ok: false } {
  try {
    return {
      document: parseMarkdownNotebook(source),
      ok: true
    };
  } catch (error) {
    return {
      diagnostics: [
        {
          message: error instanceof Error ? error.message : "Unable to parse Markdown notebook source.",
          phase: "parse"
        }
      ],
      ok: false
    };
  }
}

function buildJsonParseDiagnostic(source: string, error: unknown): NotebookSourceDiagnostic {
  const message = error instanceof Error ? error.message : "Unable to parse JSON notebook source.";
  const offsetMatch = message.match(/position\s+(\d+)/i);
  const offset = offsetMatch ? Number.parseInt(offsetMatch[1], 10) : undefined;
  const position = offset == null ? null : offsetToLineColumn(source, offset);
  return {
    column: position?.column,
    line: position?.line,
    message: `Notebook JSON parse failed: ${message}`,
    offset,
    phase: "parse"
  };
}

function offsetToLineColumn(source: string, offset: number): { column: number; line: number } {
  let line = 1;
  let column = 1;

  for (let index = 0; index < offset && index < source.length; index += 1) {
    if (source[index] === "\n") {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }

  return { column, line };
}

function resolveNotebookSourceFormat(
  source: string,
  preferredFormat?: NotebookSourceFormat
):
  | { format: NotebookSourceFormat; ok: true }
  | { message: string; ok: false } {
  if (preferredFormat) {
    return { format: preferredFormat, ok: true };
  }

  try {
    return { format: detectNotebookSourceFormat(source), ok: true };
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

function formatLabelForSourceFormat(format: NotebookSourceFormat): "JSON" | "Markdown" {
  if (format === "json") {
    return "JSON";
  }
  return "Markdown";
}

function locateSchemaDiagnosticInSource(
  source: string,
  format: NotebookSourceFormat,
  issue: NotebookValidationIssue,
  allIssues: NotebookValidationIssue[]
): Pick<NotebookSourceDiagnostic, "column" | "endOffset" | "line" | "offset"> {
  if (format === "json") {
    return locateJsonSchemaDiagnostic(source, issue, allIssues);
  }

  return {};
}

function locateJsonSchemaDiagnostic(
  source: string,
  issue: NotebookValidationIssue,
  allIssues: NotebookValidationIssue[]
): Pick<NotebookSourceDiagnostic, "column" | "endOffset" | "line" | "offset"> {
  const targetPath = buildSchemaTargetPath(issue, allIssues);
  const targetKey =
    (targetPath.length > 0 && typeof targetPath[targetPath.length - 1] === "string"
      ? (targetPath[targetPath.length - 1] as string)
      : undefined) ?? issue.relatedProperty;
  if (!targetKey) {
    return {};
  }

  const keyToken = `"${targetKey}"`;
  const offset = source.indexOf(keyToken);
  if (offset < 0) {
    return {};
  }

  const position = offsetToLineColumn(source, offset);
  return {
    column: position.column,
    endOffset: offset + keyToken.length,
    line: position.line,
    offset
  };
}

function buildSchemaTargetPath(issue: NotebookValidationIssue, allIssues: NotebookValidationIssue[]): unknown[] {
  const path = parseNotebookIssuePath(issue.path);
  const relatedProperty = resolveSchemaRelatedProperty(issue, allIssues);
  if (issue.keyword === "required" && !relatedProperty) {
    return path;
  }
  if (relatedProperty) {
    return [...path, relatedProperty];
  }
  return path;
}

function resolveSchemaRelatedProperty(
  issue: NotebookValidationIssue,
  allIssues: NotebookValidationIssue[]
): string | undefined {
  if (issue.keyword !== "required") {
    return issue.relatedProperty;
  }

  const expectedProperty = issue.relatedProperty;
  if (!expectedProperty) {
    return undefined;
  }

  const siblingAdditionalProperty = allIssues.find(
    (candidate) =>
      candidate !== issue &&
      candidate.keyword === "additionalProperties" &&
      candidate.path === issue.path &&
      isLikelyMisspelledProperty(expectedProperty, candidate.relatedProperty)
  );

  return siblingAdditionalProperty?.relatedProperty ?? expectedProperty;
}

function isLikelyMisspelledProperty(expected: string, candidate: string | undefined): boolean {
  if (!candidate) {
    return false;
  }

  if (candidate === expected) {
    return true;
  }

  if (candidate.includes(expected) || expected.includes(candidate)) {
    return true;
  }

  return levenshteinDistance(expected, candidate) <= 2;
}

function levenshteinDistance(left: string, right: string): number {
  const rows = left.length + 1;
  const columns = right.length + 1;
  const matrix = Array.from({ length: rows }, () => Array<number>(columns).fill(0));

  for (let row = 0; row < rows; row += 1) {
    matrix[row][0] = row;
  }
  for (let column = 0; column < columns; column += 1) {
    matrix[0][column] = column;
  }

  for (let row = 1; row < rows; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      const substitutionCost = left[row - 1] === right[column - 1] ? 0 : 1;
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + substitutionCost
      );
    }
  }

  return matrix[rows - 1][columns - 1];
}

function parseNotebookIssuePath(path: string | undefined): unknown[] {
  if (!path || path === "/") {
    return [];
  }

  return path
    .split("/")
    .slice(1)
    .map((segment) => decodeJsonPointerSegment(segment))
    .map((segment) => (/^\d+$/.test(segment) ? Number.parseInt(segment, 10) : segment));
}

function decodeJsonPointerSegment(segment: string): string {
  return segment.replace(/~1/g, "/").replace(/~0/g, "~");
}

function validateCell(cell: NotebookCell | Partial<NotebookCell>): void {
  if (!cell || typeof cell !== "object") {
    throw new Error("Notebook cell must be an object.");
  }
  if (typeof cell.id !== "string" || typeof cell.title !== "string" || typeof cell.type !== "string") {
    throw new Error("Notebook cell must contain id, title, and type.");
  }
}

function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "notebook";
}

function splitMarkdownSections(content: string): Array<{ title: string; body: string }> {
  const lines = content.split("\n");
  const sections: Array<{ title: string; body: string }> = [];
  let currentTitle: string | null = null;
  let currentBody: string[] = [];

  for (const line of lines) {
    if (line.startsWith("## ")) {
      if (currentTitle) {
        sections.push({ title: currentTitle, body: currentBody.join("\n").trim() });
      }
      currentTitle = line.slice(3).trim();
      currentBody = [];
      continue;
    }

    if (currentTitle) {
      currentBody.push(line);
    }
  }

  if (currentTitle) {
    sections.push({ title: currentTitle, body: currentBody.join("\n").trim() });
  }

  return sections;
}
