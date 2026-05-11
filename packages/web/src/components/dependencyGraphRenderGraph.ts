import { createSectorTopology, type SectorTopology } from "@sfcr/core";

import {
  buildDerivedAccountingTerms,
  type DerivedAccountingTerm,
  type DependencyRowTopology
} from "../notebook/dependencyRows";
import type {
  DependencySectorDisplayOccurrence,
  DependencySectorDisplayOccurrences
} from "../notebook/dependencySectors";
import type {
  DependencyGraphNode,
  ParsedDependencyGraph
} from "../notebook/dependencyGraph";
import { PROXY_KIND_PRIORITY } from "./dependencyGraphLayoutConfig";
import { resolveDisplaySector } from "./dependencyGraphLayoutSectors";
import type { DisplayNode, RenderGraph } from "./dependencyGraphLayoutTypes";

export function buildFallbackSectorTopology(
  nodes: Array<Pick<DependencyGraphNode, "name" | "variableType">>
): SectorTopology {
  return createSectorTopology(
    nodes.map((node) => ({
      variable: node.name,
      sector: node.variableType === "exogenous" ? "Exogenous" : "Unmapped",
      source: node.variableType === "exogenous" ? "explicit" : "fallback",
      confidence: node.variableType === "exogenous" ? "high" : "fallback",
      accountKind:
        node.variableType === "stock"
          ? "stock"
          : node.variableType === "flow"
            ? "flow"
            : node.variableType === "exogenous"
              ? "exogenous"
              : "auxiliary"
    }))
  );
}

export function buildBaseRenderGraph(graph: ParsedDependencyGraph): RenderGraph {
  return {
    nodes: graph.nodes,
    edges: graph.edges,
    primaryNodeIdByVariable: new Map(graph.nodes.map((node) => [node.name, node.id])),
    siblingEdges: []
  };
}

export function buildAccountingRenderGraph(
  graph: ParsedDependencyGraph,
  rowTopology: DependencyRowTopology
): RenderGraph {
  const proxies = buildDerivedAccountingTerms(rowTopology);
  if (proxies.length === 0) {
    return buildBaseRenderGraph(graph);
  }

  const proxyByCanonical = new Map<string, DerivedAccountingTerm[]>();
  proxies.forEach((proxy) => {
    const bucket = proxyByCanonical.get(proxy.canonicalVariable) ?? [];
    bucket.push(proxy);
    proxyByCanonical.set(proxy.canonicalVariable, bucket);
  });

  const nodes: DisplayNode[] = [];
  const primaryNodeIdByVariable = new Map<string, string>();
  const siblingEdges: RenderGraph["siblingEdges"] = [];
  const canonicalById = new Map(graph.nodes.map((node) => [node.id, node]));

  graph.nodes.forEach((node) => {
    const nodeProxies = proxyByCanonical.get(node.name) ?? [];
    if (nodeProxies.length === 0) {
      nodes.push(node);
      primaryNodeIdByVariable.set(node.name, node.id);
      return;
    }

    const sortedProxies = [...nodeProxies].sort((left, right) => {
      const leftMembership = rowTopology.variables[node.name]?.memberships.find(
        (membership) => membership.band === left.band
      );
      const rightMembership = rowTopology.variables[node.name]?.memberships.find(
        (membership) => membership.band === right.band
      );
      const proxyKindDelta =
        (PROXY_KIND_PRIORITY[left.proxyKind] ?? 99) - (PROXY_KIND_PRIORITY[right.proxyKind] ?? 99);
      if (proxyKindDelta !== 0) {
        return proxyKindDelta;
      }
      if ((rightMembership?.weight ?? 0) !== (leftMembership?.weight ?? 0)) {
        return (rightMembership?.weight ?? 0) - (leftMembership?.weight ?? 0);
      }
      return left.label.localeCompare(right.label);
    });

    sortedProxies.forEach((proxy, index) => {
      const proxyNode: DisplayNode = {
        ...node,
        id: proxy.id,
        label: proxy.label,
        name: node.name,
        description: `${proxy.band}: ${proxy.fullExpression}`,
        canonicalName: node.name,
        expression: proxy.fullExpression,
        proxyKind: proxy.proxyKind,
        proxyBand: proxy.band,
        isProxy: true
      };
      nodes.push(proxyNode);
      if (index === 0) {
        primaryNodeIdByVariable.set(node.name, proxy.id);
      }
    });

    const primaryProxyId = sortedProxies[0]?.id;
    if (primaryProxyId) {
      sortedProxies.slice(1).forEach((proxy) => {
        siblingEdges.push({
          id: `sibling:${primaryProxyId}->${proxy.id}`,
          sourceId: primaryProxyId,
          targetId: proxy.id
        });
      });
    }
  });

  const edges = graph.edges.map((edge) => {
    const sourceNode = canonicalById.get(edge.sourceId);
    const targetNode = canonicalById.get(edge.targetId);
    const sourceId = sourceNode ? primaryNodeIdByVariable.get(sourceNode.name) ?? edge.sourceId : edge.sourceId;
    const targetId = targetNode ? primaryNodeIdByVariable.get(targetNode.name) ?? edge.targetId : edge.targetId;
    return {
      ...edge,
      id: `${sourceId}->${targetId}`,
      sourceId,
      targetId
    };
  });

  const edgeIds = new Set(edges.map((edge) => edge.id));
  proxies.forEach((proxy) => {
    proxy.references.forEach((reference) => {
      if (reference.name === proxy.canonicalVariable) {
        return;
      }
      const sourceId = primaryNodeIdByVariable.get(reference.name) ?? reference.name;
      if (!nodes.some((node) => node.id === sourceId) || sourceId === proxy.id) {
        return;
      }
      const edgeId = `${sourceId}->${proxy.id}`;
      if (edgeIds.has(edgeId)) {
        return;
      }
      edges.push({
        id: edgeId,
        sourceId,
        targetId: proxy.id,
        current: reference.current,
        lagged: reference.lagged
      });
      edgeIds.add(edgeId);
    });
  });

  return { nodes, edges, primaryNodeIdByVariable, siblingEdges };
}

export function buildSectorOccurrenceRenderGraph(
  renderGraph: RenderGraph,
  sectorTopology: SectorTopology,
  sectorDisplayOccurrences: DependencySectorDisplayOccurrences
): RenderGraph {
  const nodes: DisplayNode[] = [];
  const siblingEdges = [...renderGraph.siblingEdges];
  let hasExpansion = false;
  let hasOccurrenceLabelUpdates = false;

  renderGraph.nodes.forEach((node) => {
    const canonicalName = node.canonicalName ?? node.name;
    const dedupedOccurrences = new Map<string, DependencySectorDisplayOccurrence>();
    (sectorDisplayOccurrences[canonicalName] ?? []).forEach((occurrence) => {
      const matchesNode = node.isProxy
        ? occurrence.displayLabel === node.label &&
          (occurrence.kind === "proxy" ||
            (occurrence.kind === "direct" && occurrence.displayLabel === canonicalName))
        : occurrence.displayLabel === node.label ||
          (occurrence.kind === "direct" && node.label === canonicalName && occurrence.variable === canonicalName);
      if (
        !matchesNode ||
        occurrence.sector === "Exogenous" ||
        occurrence.sector === "Unmapped"
      ) {
        return;
      }

      const occurrenceKey = `${occurrence.displayLabel}::${occurrence.sector}::${occurrence.sign}`;
      if (!dedupedOccurrences.has(occurrenceKey)) {
        dedupedOccurrences.set(occurrenceKey, occurrence);
      }
    });
    const occurrences = Array.from(dedupedOccurrences.values());
    const primarySector = resolveDisplaySector(node, sectorTopology);
    const orderedOccurrences = [...occurrences].sort((left, right) => {
      if (left.sector === primarySector && right.sector !== primarySector) {
        return -1;
      }
      if (right.sector === primarySector && left.sector !== primarySector) {
        return 1;
      }
      return left.sourceCellKey.localeCompare(right.sourceCellKey);
    });

    if (orderedOccurrences.length === 0) {
      nodes.push(node);
      return;
    }

    const primaryOccurrence = orderedOccurrences[0];
    const primaryNode: DisplayNode = {
      ...node,
      canonicalName,
      label: formatOccurrenceLabel(primaryOccurrence?.displayLabel ?? node.label, primaryOccurrence?.sign),
      mirrorSector: primaryOccurrence?.sector,
      occurrenceKey: primaryOccurrence?.sourceCellKey,
      occurrenceSign: primaryOccurrence?.sign
    };
    if (primaryNode.label !== node.label || primaryNode.mirrorSector !== node.mirrorSector) {
      hasOccurrenceLabelUpdates = true;
    }
    nodes.push(primaryNode);

    orderedOccurrences.slice(1).forEach((occurrence) => {
      hasExpansion = true;
      const mirrorId = `sector-occurrence:${node.id}:${occurrence.sourceCellKey}`;
      nodes.push({
        ...node,
        id: mirrorId,
        canonicalName,
        isMirror: true,
        label: formatOccurrenceLabel(occurrence.displayLabel, occurrence.sign),
        mirrorSector: occurrence.sector,
        occurrenceKey: occurrence.sourceCellKey,
        occurrenceSign: occurrence.sign
      });
      siblingEdges.push({
        id: `sibling:${primaryNode.id}->${mirrorId}`,
        sourceId: primaryNode.id,
        targetId: mirrorId
      });
    });
  });

  if (!hasExpansion && !hasOccurrenceLabelUpdates) {
    return renderGraph;
  }

  return {
    ...renderGraph,
    nodes,
    siblingEdges
  };
}

function formatOccurrenceLabel(
  label: string,
  sign: DependencySectorDisplayOccurrence["sign"] | undefined
): string {
  if (!sign || sign === "neutral") {
    return label;
  }
  return `${sign}${label}`;
}
