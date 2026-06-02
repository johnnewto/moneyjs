export type LinkPolarity = "+" | "-";

export interface Link {
  from: string;
  to: string;
  polarity: LinkPolarity;
  lagged: boolean;
}

export type LoopPolarity = "R" | "B";

export interface LoopEdge {
  from: string;
  to: string;
  polarity: LinkPolarity;
  lagged: boolean;
}

export interface Loop {
  nodes: string[];
  edges: LoopEdge[];
  polarity: LoopPolarity;
}

export interface CldResult {
  links: Link[];
  mermaid: string;
  loops: Loop[];
  loopSummary: string;
  errors: string[];
}

export type CldNodeKind = "stock" | "flow" | "aux";
