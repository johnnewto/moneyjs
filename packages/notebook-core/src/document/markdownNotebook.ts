import type { NotebookCell, NotebookDocument } from "../types";
import { stringifyJsonWithCompactLeaves } from "../jsonFormat";
import { slugifyTitle, validateCell } from "./documentUtils";
import { normalizeNotebookCell, serializeNotebookCell } from "./notebookSerialize";
import { createNotebookSourceDiagnostic, type NotebookSourceDiagnostic } from "./sourcePipeline";

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

export function parseMarkdownNotebookSource(
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
          ...createNotebookSourceDiagnostic({
            message: error instanceof Error ? error.message : "Unable to parse Markdown notebook source.",
            phase: "parse"
          })
        }
      ],
      ok: false
    };
  }
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
