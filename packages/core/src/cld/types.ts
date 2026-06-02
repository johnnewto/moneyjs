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

export interface DetectLoopsOptions {
  maxLoops?: number;
  maxLoopLength?: number;
  timeoutMs?: number;
}

export type CldLoopDetectionStopReason = "maxLoops" | "timeout";

export interface CldLoopDetectionMeta {
  truncated: boolean;
  stopReason?: CldLoopDetectionStopReason;
  maxLoops: number;
  maxLoopLength: number;
  timeoutMs: number;
}

export interface CldResult {
  links: Link[];
  mermaid: string;
  loops: Loop[];
  loopSummary: string;
  errors: string[];
  loopDetection?: CldLoopDetectionMeta;
}

export type CldNodeKind = "stock" | "flow" | "aux";
