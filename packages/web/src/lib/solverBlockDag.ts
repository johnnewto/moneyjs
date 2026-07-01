import { MarkerType, type Edge, type Node } from "@xyflow/react";
import { parseEquation, type EquationBlock, type ModelDefinition } from "@sfcr/core";

export const SOLVER_BLOCK_DAG_COLORS = [
  "#1d4ed8",
  "#15803d",
  "#b45309",
  "#be185d",
  "#0f766e",
  "#7c3aed",
  "#c2410c",
  "#0369a1"
] as const;

export interface SolverBlockDagGraphNode {
  id: string;
  blockId: number;
  cyclic: boolean;
  layer: number;
}

export interface SolverBlockDagGraphEdge {
  id: string;
  source: string;
  target: string;
  intraBlock: boolean;
}

export interface SolverBlockDagGraph {
  nodes: SolverBlockDagGraphNode[];
  edges: SolverBlockDagGraphEdge[];
  errors: string[];
}

const NODE_WIDTH = 104;
const NODE_HEIGHT = 44;
const H_GAP = 28;
const V_GAP = 72;
const CANVAS_PADDING = 48;

export interface SolverBlockDagLayout {
  nodes: Node[];
  edges: Edge[];
  width: number;
  height: number;
}

export function colorForSolverBlock(blockId: number): string {
  return SOLVER_BLOCK_DAG_COLORS[blockId % SOLVER_BLOCK_DAG_COLORS.length] ?? SOLVER_BLOCK_DAG_COLORS[0];
}

export function buildSolverBlockDagGraph(
  model: ModelDefinition,
  blocks: EquationBlock[]
): SolverBlockDagGraph {
  const errors: string[] = [];
  const blockMetaByEquation = new Map<string, { blockId: number; cyclic: boolean; layer: number }>();

  blocks.forEach((block, layerIndex) => {
    for (const name of block.equationNames) {
      blockMetaByEquation.set(name, {
        blockId: block.id,
        cyclic: block.cyclic,
        layer: layerIndex
      });
    }
  });

  const endogenous = new Set(model.equations.map((equation) => equation.name));
  const parsedByName = new Map<string, ReturnType<typeof parseEquation>>();
  const nodes: SolverBlockDagGraphNode[] = [];

  for (const equation of model.equations) {
    const meta = blockMetaByEquation.get(equation.name);
    if (!meta) {
      errors.push(`Equation ${equation.name} is missing from solver block structure.`);
      continue;
    }

    try {
      parsedByName.set(equation.name, parseEquation(equation.name, equation.expression));
    } catch (error) {
      errors.push(
        `Equation ${equation.name}: ${
          error instanceof Error ? error.message : "Unable to parse expression."
        }`
      );
    }

    nodes.push({
      id: equation.name,
      blockId: meta.blockId,
      cyclic: meta.cyclic,
      layer: meta.layer
    });
  }

  const edges: SolverBlockDagGraphEdge[] = [];
  for (const [name, parsed] of parsedByName) {
    const targetMeta = blockMetaByEquation.get(name);
    if (!targetMeta) {
      continue;
    }

    for (const dependency of parsed.currentDependencies) {
      if (!endogenous.has(dependency) || dependency === name) {
        continue;
      }

      const sourceMeta = blockMetaByEquation.get(dependency);
      if (!sourceMeta) {
        continue;
      }

      edges.push({
        id: `${dependency}->${name}`,
        source: dependency,
        target: name,
        intraBlock: sourceMeta.blockId === targetMeta.blockId
      });
    }
  }

  return { nodes, edges, errors };
}

export function buildSolverBlockDagLayout(graph: SolverBlockDagGraph): SolverBlockDagLayout {
  const nodesByLayer = new Map<number, SolverBlockDagGraphNode[]>();

  for (const node of graph.nodes) {
    const bucket = nodesByLayer.get(node.layer) ?? [];
    bucket.push(node);
    nodesByLayer.set(node.layer, bucket);
  }

  const layerCount = Math.max(
    graph.nodes.reduce((maxLayer, node) => Math.max(maxLayer, node.layer + 1), 0),
    1
  );
  let maxRowWidth = 0;

  for (let layer = 0; layer < layerCount; layer += 1) {
    const row = (nodesByLayer.get(layer) ?? []).slice().sort((left, right) => left.id.localeCompare(right.id));
    const rowWidth = row.length * NODE_WIDTH + Math.max(row.length - 1, 0) * H_GAP;
    maxRowWidth = Math.max(maxRowWidth, rowWidth);
  }

  const flowNodes: Node[] = graph.nodes.map((node) => {
    const row = (nodesByLayer.get(node.layer) ?? []).slice().sort((left, right) => left.id.localeCompare(right.id));
    const rowWidth = row.length * NODE_WIDTH + Math.max(row.length - 1, 0) * H_GAP;
    const offsetX = CANVAS_PADDING + (maxRowWidth - rowWidth) / 2;
    const index = row.findIndex((entry) => entry.id === node.id);

    return {
      id: node.id,
      type: "solverBlockDag",
      position: {
        x: offsetX + index * (NODE_WIDTH + H_GAP),
        y: CANVAS_PADDING + node.layer * (NODE_HEIGHT + V_GAP)
      },
      data: {
        label: node.id,
        blockId: node.blockId,
        cyclic: node.cyclic,
        color: colorForSolverBlock(node.blockId)
      },
      draggable: true
    };
  });

  const edges: Edge[] = graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    className: edge.intraBlock ? "solver-block-dag-edge is-intra-block" : "solver-block-dag-edge",
    markerEnd: { type: MarkerType.ArrowClosed },
    style: {
      strokeWidth: edge.intraBlock ? 2 : 1.5,
      opacity: edge.intraBlock ? 0.55 : 0.35
    }
  }));

  return {
    nodes: flowNodes,
    edges,
    width: maxRowWidth + CANVAS_PADDING * 2,
    height: layerCount * NODE_HEIGHT + Math.max(layerCount - 1, 0) * V_GAP + CANVAS_PADDING * 2
  };
}
