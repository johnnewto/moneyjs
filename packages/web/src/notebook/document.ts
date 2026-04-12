import type { NotebookCell, NotebookDocument } from "./types";

export function notebookToJson(document: NotebookDocument): string {
  return JSON.stringify(document, null, 2);
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
    lines.push(JSON.stringify(cell, null, 2));
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
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Notebook JSON must be an object.");
  }
  if (typeof parsed.id !== "string" || typeof parsed.title !== "string") {
    throw new Error("Notebook JSON must contain string id and title fields.");
  }
  if (!parsed.metadata || parsed.metadata.version !== 1) {
    throw new Error("Notebook JSON metadata.version must be 1.");
  }
  if (!Array.isArray(parsed.cells)) {
    throw new Error("Notebook JSON must contain a cells array.");
  }

  parsed.cells.forEach(validateCell);

  return parsed as NotebookDocument;
}

export function notebookFromMarkdown(source: string): NotebookDocument {
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
    const fenceMatch = body.match(/^```sfcr-([a-z]+)\n([\s\S]*?)\n```$/);

    if (fenceMatch) {
      const cell = JSON.parse(fenceMatch[2]) as NotebookCell;
      validateCell(cell);
      cells.push(cell);
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

  return {
    id: slugifyTitle(title),
    title,
    metadata: { version: 1 },
    cells
  };
}

export function detectNotebookSourceFormat(source: string): "json" | "markdown" {
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
  preferredFormat?: "json" | "markdown"
): { document: NotebookDocument; format: "json" | "markdown" } {
  const format = preferredFormat ?? detectNotebookSourceFormat(source);
  return {
    document: format === "json" ? notebookFromJson(source) : notebookFromMarkdown(source),
    format
  };
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
