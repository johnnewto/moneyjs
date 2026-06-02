import type { CldNodeKind, Link } from "./types";

function renderNodeDeclaration(name: string, kind?: CldNodeKind): string | null {
  if (!kind) {
    return null;
  }
  switch (kind) {
    case "stock":
      return `${name}[${name}]`;
    case "flow":
      return `${name}(${name})`;
    case "aux":
      // Keep aux distinct but unobtrusive.
      return `${name}(${name})`;
  }
}

export function formatCldMermaid(
  links: Link[],
  options?: { nodeKinds?: Record<string, CldNodeKind | undefined> }
): string {
  const lines = ["flowchart TD", ""];
  const nodeKinds = options?.nodeKinds;

  if (nodeKinds) {
    const nodes = new Set<string>();
    for (const link of links) {
      nodes.add(link.from);
      nodes.add(link.to);
    }
    for (const node of [...nodes].sort((a, b) => a.localeCompare(b))) {
      const declaration = renderNodeDeclaration(node, nodeKinds[node]);
      if (declaration) {
        lines.push(declaration);
      }
    }
    if (nodes.size > 0) {
      lines.push("");
    }
  }

  for (const link of links) {
    lines.push(`${link.from} -->|${link.polarity}| ${link.to}`);
  }
  return lines.join("\n");
}
