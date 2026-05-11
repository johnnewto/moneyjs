import type { DependencyRowTopology } from "../notebook/dependencyRows";
import type { DependencyGraphEdge, ParsedDependencyGraph } from "../notebook/dependencyGraph";
import {
  BAND_COLORS,
  BOTTOM_PADDING,
  HORIZONTAL_BAND_GAP,
  HORIZONTAL_BAND_HEIGHT,
  HORIZONTAL_LABEL_X,
  NODE_HEIGHT,
  SIDE_PADDING,
  TOP_PADDING
} from "./dependencyGraphLayoutConfig";
import type { DisplayNode, GraphBand, GraphColumnLabel } from "./dependencyGraphLayoutTypes";

export function collectVisibleAccountingBands(
  nodes: Array<Pick<DisplayNode, "name" | "proxyBand">>,
  rowTopology: DependencyRowTopology,
  ignoreInferredBandsForPlacement: boolean
): string[] {
  return rowTopology.bands.filter((band) =>
    band !== "Unmapped" &&
    band !== "Exogenous" &&
    nodes.some((node) => {
      if (node.proxyBand === band) {
        return true;
      }
      const assignment = getPlacementAssignment(
        rowTopology.variables[node.name],
        ignoreInferredBandsForPlacement
      );
      return assignment?.memberships.some((membership) => membership.band === band) ?? false;
    })
  );
}

export function buildAccountingBandLayoutData(
  nodes: Array<Pick<DisplayNode, "name" | "proxyBand">>,
  rowTopology: DependencyRowTopology,
  ignoreInferredBandsForPlacement: boolean
): {
  bandNames: string[];
  bandCenters: number[];
  bandCenterByName: Map<string, number>;
  height: number;
} {
  const bandNames = collectVisibleAccountingBands(nodes, rowTopology, ignoreInferredBandsForPlacement);
  const bandCenters = bandNames.map(
    (_, index) =>
      TOP_PADDING +
      HORIZONTAL_BAND_HEIGHT / 2 +
      index * (HORIZONTAL_BAND_HEIGHT + HORIZONTAL_BAND_GAP)
  );

  return {
    bandNames,
    bandCenters,
    bandCenterByName: new Map(
      bandNames.map((band, index) => [band, bandCenters[index] ?? TOP_PADDING])
    ),
    height:
      bandNames.length > 0
        ? TOP_PADDING +
          (bandNames.length - 1) * (HORIZONTAL_BAND_HEIGHT + HORIZONTAL_BAND_GAP) +
          HORIZONTAL_BAND_HEIGHT +
          BOTTOM_PADDING
        : TOP_PADDING + NODE_HEIGHT + BOTTOM_PADDING
  };
}

export function buildAccountingBandLabels(
  bandNames: string[],
  bandCenters: number[],
  graph: Pick<ParsedDependencyGraph, "nodes" | "edges">,
  rowTopology: DependencyRowTopology,
  ignoreInferredBandsForPlacement: boolean
): GraphColumnLabel[] {
  return bandNames.map((band, index) => ({
    id: `band-${band}`,
    x: HORIZONTAL_LABEL_X,
    y: (bandCenters[index] ?? TOP_PADDING) - 6,
    label: band,
    subtitle: buildBandSubtitle(band, graph, rowTopology, ignoreInferredBandsForPlacement),
    textAnchor: "start"
  }));
}

export function getPlacementAssignment(
  assignment: DependencyRowTopology["variables"][string],
  ignoreInferredBandsForPlacement: boolean
): DependencyRowTopology["variables"][string] {
  if (!assignment || !ignoreInferredBandsForPlacement) {
    return assignment;
  }

  const memberships = assignment.memberships.filter((membership) => membership.source !== "inferred");
  return {
    ...assignment,
    primaryBand: memberships[0]?.band ?? "Unmapped",
    memberships
  };
}

export function buildAccountingBandRenderBands(
  bandNames: string[],
  bandCenters: number[],
  width: number,
  useMutedFill: boolean
): GraphBand[] {
  return bandNames.map((band, index) => {
    const palette = BAND_COLORS[index % BAND_COLORS.length];
    const centerY = bandCenters[index] ?? TOP_PADDING;
    return {
      id: `horizontal-band-${band}`,
      x: SIDE_PADDING - 12,
      y: centerY - HORIZONTAL_BAND_HEIGHT / 2,
      width: width - SIDE_PADDING * 2 + 24,
      height: HORIZONTAL_BAND_HEIGHT,
      fill: useMutedFill ? palette.fill.replace("0.", "0.18") : palette.fill,
      stroke: palette.stroke
    };
  });
}

export function buildSoftAccountingAnchorYByNode(
  graph: { nodes: Array<DisplayNode>; edges: Array<DependencyGraphEdge> },
  rowTopology: DependencyRowTopology,
  bandCenterByName: Map<string, number>,
  ignoreInferredBandsForPlacement: boolean
): Map<string, number> {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const scoresByNode = new Map<string, Map<string, number>>();

  graph.nodes.forEach((node) => {
    const assignment = getPlacementAssignment(
      rowTopology.variables[node.name],
      ignoreInferredBandsForPlacement
    );
    const primaryBand = assignment?.primaryBand ?? "Unmapped";
    if ((primaryBand !== "Unmapped" && primaryBand !== "Exogenous") || node.proxyBand) {
      return;
    }
    scoresByNode.set(node.id, new Map());
  });

  graph.edges.forEach((edge) => {
    const sourceNode = nodeById.get(edge.sourceId);
    const targetNode = nodeById.get(edge.targetId);
    const weight = edge.current ? (edge.lagged ? 1.4 : 2) : 0.75;

    if (targetNode && scoresByNode.has(targetNode.id) && sourceNode) {
      accumulateSoftAnchorScores(
        scoresByNode.get(targetNode.id)!,
        getPlacementAssignment(rowTopology.variables[sourceNode.name], ignoreInferredBandsForPlacement),
        weight
      );
    }
    if (sourceNode && scoresByNode.has(sourceNode.id) && targetNode) {
      accumulateSoftAnchorScores(
        scoresByNode.get(sourceNode.id)!,
        getPlacementAssignment(rowTopology.variables[targetNode.name], ignoreInferredBandsForPlacement),
        weight * 0.75
      );
    }
  });

  const anchors = new Map<string, number>();
  scoresByNode.forEach((scores, nodeId) => {
    let weightedSum = 0;
    let totalWeight = 0;
    scores.forEach((score, band) => {
      const center = bandCenterByName.get(band);
      if (center == null) {
        return;
      }
      weightedSum += center * score;
      totalWeight += score;
    });
    if (totalWeight > 0) {
      anchors.set(nodeId, weightedSum / totalWeight);
    }
  });

  return anchors;
}

function accumulateSoftAnchorScores(
  scoreByBand: Map<string, number>,
  assignment: DependencyRowTopology["variables"][string],
  edgeWeight: number
): void {
  assignment?.memberships.forEach((membership) => {
    if (membership.band === "Unmapped" || membership.band === "Exogenous") {
      return;
    }
    const score =
      (scoreByBand.get(membership.band) ?? 0) + edgeWeight * Math.max(0.35, membership.weight);
    scoreByBand.set(membership.band, score);
  });
}

function buildBandSubtitle(
  band: string,
  graph: Pick<ParsedDependencyGraph, "nodes" | "edges">,
  rowTopology: DependencyRowTopology,
  ignoreInferredBandsForPlacement: boolean
): string | undefined {
  const nodes = graph.nodes.filter((node) => {
    const assignment = getPlacementAssignment(
      rowTopology.variables[node.name],
      ignoreInferredBandsForPlacement
    );
    return assignment?.primaryBand === band;
  });
  if (nodes.length === 0) {
    return undefined;
  }
  const explicit = nodes.filter((node) =>
    rowTopology.variables[node.name]?.memberships.some(
      (membership) => membership.band === band && membership.source !== "inferred"
    )
  ).length;
  const inferred = nodes.length - explicit;
  return inferred > 0 ? `${explicit} explicit, ${inferred} inferred` : `${explicit} mapped`;
}
