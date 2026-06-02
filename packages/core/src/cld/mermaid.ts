import type { Link } from "./types";

export function formatCldMermaid(links: Link[]): string {
  const lines = ["flowchart TD", ""];
  for (const link of links) {
    lines.push(`${link.from} -->|${link.polarity}| ${link.to}`);
  }
  return lines.join("\n");
}
