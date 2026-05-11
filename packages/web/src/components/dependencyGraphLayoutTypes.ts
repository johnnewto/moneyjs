import type { DerivedAccountingTerm } from "../notebook/dependencyRows";
import type { DependencySectorDisplayOccurrence } from "../notebook/dependencySectors";
import type { DependencyGraphEdge, DependencyGraphNode } from "../notebook/dependencyGraph";

export type DisplayNode = DependencyGraphNode & {
  canonicalName?: string;
  displaySector?: string;
  expression?: string;
  isMirror?: boolean;
  occurrenceKey?: string;
  occurrenceSign?: DependencySectorDisplayOccurrence["sign"];
  proxyKind?: DerivedAccountingTerm["proxyKind"];
  proxyBand?: string;
  mirrorSector?: string;
  isProxy?: boolean;
};

export interface PositionedNode extends DisplayNode {
  x: number;
  y: number;
}

export interface GraphColumnLabel {
  id: string;
  x: number;
  y?: number;
  label: string;
  subtitle?: string;
  textAnchor?: "start" | "middle" | "end";
}

export interface GraphBand {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  stroke: string;
}

export interface GraphLayout {
  width: number;
  height: number;
  nodeWidth: number;
  nodeHeight: number;
  labels: GraphColumnLabel[];
  bands: GraphBand[];
  nodes: PositionedNode[];
  cellSpreadDiagnostics?: CellSpreadDiagnosticEntry[];
}

export interface RenderGraph {
  nodes: DisplayNode[];
  edges: DependencyGraphEdge[];
  primaryNodeIdByVariable: Map<string, string>;
  siblingEdges: Array<{ id: string; sourceId: string; targetId: string }>;
}

export interface DependencyNodeBox {
  id: string;
  name: string;
  x: number;
  y: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  isExogenous: boolean;
}

export interface DependencyOverlapPair {
  leftId: string;
  rightId: string;
  overlapX: number;
  overlapY: number;
  overlapArea: number;
  overlapRatio: number;
}

export interface ExogenousPlacementDiagnostic {
  nodeId: string;
  name: string;
  targetX: number;
  targetY: number;
  finalX: number;
  finalY: number;
  outgoingTargetIds: string[];
  horizontalMinX: number;
  horizontalMaxX: number;
  hardMinHorizontalGap: number;
  isBoundSaturated: boolean;
}

export interface CellSpreadDiagnosticEntry {
  cellKey: string;
  cellX: number;
  cellY: number;
  cellWidth: number;
  cellHeight: number;
  columns: number;
  rows: number;
  nodeCount: number;
  nodes: Array<{
    id: string;
    name: string;
    beforeX: number;
    beforeY: number;
    afterX: number;
    afterY: number;
  }>;
}

export interface DependencyLayoutDiagnostics {
  nodeBoxes: DependencyNodeBox[];
  overlapPairs: DependencyOverlapPair[];
  maxOverlapRatio: number;
  exogenousPlacements: ExogenousPlacementDiagnostic[];
  cellSpreadEntries: CellSpreadDiagnosticEntry[];
}

export interface DependencyGraphLayoutSnapshot {
  layout: GraphLayout;
  renderGraph: RenderGraph | null;
  diagnostics: DependencyLayoutDiagnostics;
}
