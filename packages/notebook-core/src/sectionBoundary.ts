import { parseEquation } from "@sfcr/core";

import type { EquationListItem, EquationRow, ExternalListItem, RowComment } from "./types";
import { equationRowsOnly, isRowComment } from "./rowComments";

export interface SectionBoundarySignature {
  functionName: string;
  inputs: string[];
  outputs: string[];
}

export interface ParsedSectionComment {
  title: string;
  boundary: SectionBoundarySignature | null;
}

export interface EquationSection {
  comment: RowComment;
  title: string;
  boundary: SectionBoundarySignature | null;
  equations: EquationRow[];
}

const BOUNDARY_SIGNATURE_PATTERN =
  /^([^=]+?)\s*=\s*([A-Za-z_]\w*)\s*\(\s*([^)]*)\s*\)\s*$/;

function parseVariableList(raw: string): string[] {
  if (!raw.trim()) {
    return [];
  }

  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

export function functionNameFromSectionTitle(title: string): string {
  const normalized = title.trim().replace(/[.!?]+$/, "").trim();
  const slug = normalized.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return slug || "Section";
}

export function parseSectionBoundarySignature(raw: string): SectionBoundarySignature | null {
  const source = raw.trim();
  if (!source) {
    return null;
  }

  const match = source.match(BOUNDARY_SIGNATURE_PATTERN);
  if (!match) {
    return null;
  }

  const outputs = parseVariableList(match[1] ?? "");
  const functionName = (match[2] ?? "").trim();
  const inputs = parseVariableList(match[3] ?? "");

  if (!functionName || outputs.length === 0) {
    return null;
  }

  return {
    functionName,
    inputs: uniqueSorted(inputs),
    outputs: uniqueSorted(outputs)
  };
}

export function formatSectionBoundarySignature(boundary: SectionBoundarySignature): string {
  const outputs = uniqueSorted(boundary.outputs).join(", ");
  const inputs = uniqueSorted(boundary.inputs).join(", ");
  return `${outputs} = ${boundary.functionName} (${inputs})`;
}

export function parseSectionCommentText(text: string): ParsedSectionComment {
  const raw = text.trim();
  if (!raw) {
    return { title: "", boundary: null };
  }

  const pipeIndex = raw.indexOf("|");
  if (pipeIndex < 0) {
    return { title: raw, boundary: null };
  }

  const title = raw.slice(0, pipeIndex).trim();
  const boundary = parseSectionBoundarySignature(raw.slice(pipeIndex + 1));
  return { title, boundary };
}

export function formatSectionCommentText(title: string, boundary: SectionBoundarySignature | null): string {
  const trimmedTitle = title.trim();
  if (!boundary) {
    return trimmedTitle;
  }

  return `${trimmedTitle} | ${formatSectionBoundarySignature(boundary)}`;
}

export function sectionCommentSlugSource(text: string): string {
  const parsed = parseSectionCommentText(text);
  return parsed.title || text.trim();
}

export function normalizeSectionCommentText(text: string): string {
  return parseSectionCommentText(text).title;
}

export function validateSectionCommentText(text: string): string | null {
  const title = normalizeSectionCommentText(text);
  if (!title) {
    return "Section title is required.";
  }

  if (text.includes("|")) {
    return "Section boundary signatures are generated automatically; enter the section title only.";
  }

  return null;
}

export function splitEquationListIntoSections(items: readonly EquationListItem[]): EquationSection[] {
  const sections: EquationSection[] = [];
  let currentComment: RowComment | null = null;
  let currentEquations: EquationRow[] = [];

  const pushSection = () => {
    if (!currentComment) {
      return;
    }

    const parsed = parseSectionCommentText(currentComment.text);
    sections.push({
      comment: currentComment,
      title: parsed.title,
      boundary: parsed.boundary,
      equations: currentEquations
    });
    currentEquations = [];
  };

  for (const item of items) {
    if (isRowComment(item)) {
      pushSection();
      currentComment = item;
      continue;
    }

    if (!currentComment) {
      continue;
    }

    currentEquations.push(item);
  }

  pushSection();
  return sections;
}

interface ParsedSectionEquation {
  row: EquationRow;
  currentDependencies: string[];
  lagDependencies: string[];
}

function parseSectionEquations(equations: EquationRow[]): ParsedSectionEquation[] {
  return equations.flatMap((row) => {
    const name = row.name.trim();
    const expression = row.expression.trim();
    if (!name || !expression) {
      return [];
    }

    try {
      const parsed = parseEquation(name, expression);
      return [
        {
          row,
          currentDependencies: parsed.currentDependencies,
          lagDependencies: parsed.lagDependencies
        }
      ];
    } catch {
      return [];
    }
  });
}

function collectDependencies(entry: ParsedSectionEquation): string[] {
  return uniqueSorted([...entry.currentDependencies, ...entry.lagDependencies]);
}

export function inferSectionBoundary(args: {
  section: EquationSection;
  sections: EquationSection[];
  externalNames?: ReadonlySet<string>;
}): SectionBoundarySignature | null {
  const externalNames = args.externalNames ?? new Set<string>();
  const sectionIndex = args.sections.indexOf(args.section);
  if (sectionIndex < 0) {
    return null;
  }

  const definedBySection = new Map<string, number>();
  args.sections.forEach((section, index) => {
    section.equations.forEach((equation) => {
      const name = equation.name.trim();
      if (name) {
        definedBySection.set(name, index);
      }
    });
  });

  const parsedSection = parseSectionEquations(args.section.equations);
  if (parsedSection.length === 0) {
    return null;
  }

  const definedHere = new Set(args.section.equations.map((equation) => equation.name.trim()).filter(Boolean));
  const inputs = new Set<string>();

  parsedSection.forEach((entry) => {
    collectDependencies(entry).forEach((dependency) => {
      if (externalNames.has(dependency) || definedHere.has(dependency)) {
        return;
      }

      const ownerSection = definedBySection.get(dependency);
      if (ownerSection !== undefined && ownerSection !== sectionIndex) {
        inputs.add(dependency);
      }
    });
  });

  const outputs = new Set<string>();
  args.sections.forEach((section, index) => {
    if (index === sectionIndex) {
      return;
    }

    parseSectionEquations(section.equations).forEach((entry) => {
      collectDependencies(entry).forEach((dependency) => {
        if (definedHere.has(dependency)) {
          outputs.add(dependency);
        }
      });
    });
  });

  if (inputs.size === 0 && outputs.size === 0) {
    return null;
  }

  return {
    functionName: functionNameFromSectionTitle(args.section.title),
    inputs: uniqueSorted(inputs),
    outputs: uniqueSorted(outputs)
  };
}

export function inferEquationSectionBoundaries(args: {
  equations: readonly EquationListItem[];
  externals?: readonly ExternalListItem[];
}): Map<string, SectionBoundarySignature> {
  const sections = splitEquationListIntoSections(args.equations);
  const externalNames = buildExternalNameSet(args.externals);
  const inferred = new Map<string, SectionBoundarySignature>();

  sections.forEach((section) => {
    const boundary = inferSectionBoundary({ section, sections, externalNames });
    if (!boundary) {
      return;
    }

    inferred.set(section.comment.id, boundary);
    const titleKey = normalizeSectionCommentText(section.comment.text);
    if (titleKey) {
      inferred.set(titleKey, boundary);
    }
  });

  return inferred;
}

function buildExternalNameSet(externals: readonly ExternalListItem[] | undefined): Set<string> {
  return new Set(
    equationRowsOnly(externals ?? []).map((external) => external.name.trim()).filter(Boolean)
  );
}

export function resolveInferredSectionBoundary(args: {
  comment: RowComment;
  equations: readonly EquationListItem[];
  externals?: readonly ExternalListItem[];
}): SectionBoundarySignature | null {
  const boundaries = inferEquationSectionBoundaries({
    equations: args.equations,
    externals: args.externals
  });

  return (
    boundaries.get(args.comment.id) ??
    boundaries.get(normalizeSectionCommentText(args.comment.text)) ??
    null
  );
}

export function compareSectionBoundaries(
  declared: SectionBoundarySignature,
  inferred: SectionBoundarySignature
): string[] {
  const issues: string[] = [];
  const declaredInputs = new Set(declared.inputs);
  const inferredInputs = new Set(inferred.inputs);
  const declaredOutputs = new Set(declared.outputs);
  const inferredOutputs = new Set(inferred.outputs);

  declared.inputs.forEach((name) => {
    if (!inferredInputs.has(name)) {
      issues.push(`input '${name}' is not used from other sections`);
    }
  });
  inferred.inputs.forEach((name) => {
    if (!declaredInputs.has(name)) {
      issues.push(`missing input '${name}'`);
    }
  });

  declared.outputs.forEach((name) => {
    if (!inferredOutputs.has(name)) {
      issues.push(`output '${name}' is not referenced outside the section`);
    }
  });
  inferred.outputs.forEach((name) => {
    if (!declaredOutputs.has(name)) {
      issues.push(`missing output '${name}'`);
    }
  });

  return issues;
}
