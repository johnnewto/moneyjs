import {
  analyzeParsedEquation,
  isIdentityLike,
  parseEquation,
  type EquationRole
} from "@sfcr/core";

import type { EditorState, EquationRow, ExternalRow, InitialValueRow } from "../lib/editorModel";

export type VariableType = "parameter" | "auxiliary" | "flow" | "stock" | "exogenous";
export interface DependencyGraphNode {
  id: string;
  name: string;
  label: string;
  variableType: VariableType;
  equationRole: EquationRole | null;
  equationIndex: number | null;
  layer: number;
  order: number;
  cluster: "exogenous" | "equation";
  degree: number;
  currentDependencyNames: string[];
  lagDependencyNames: string[];
  hasSelfLag: boolean;
  isCyclic: boolean;
  description?: string;
  initialValue?: number;
}

export interface DependencyGraphEdge {
  id: string;
  sourceId: string;
  targetId: string;
  lagged: boolean;
  current: boolean;
}

export interface ParsedDependencyGraph {
  nodes: DependencyGraphNode[];
  edges: DependencyGraphEdge[];
  errors: string[];
  layerCount: number;
}

interface ParsedEquationEntry {
  row: EquationRow;
  equationIndex: number;
  parsed: ReturnType<typeof parseEquation>;
}

interface ComponentInfo {
  id: number;
  nodeNames: string[];
  cyclic: boolean;
}

const VARIABLE_TYPE_SORT_ORDER: Record<VariableType, number> = {
  exogenous: 0,
  parameter: 0,
  flow: 1,
  auxiliary: 2,
  stock: 3
};

export function buildDependencyGraph(
  editor: Pick<EditorState, "equations" | "externals" | "initialValues">
): ParsedDependencyGraph {
  const errors: string[] = [];
  const parsedEquations: ParsedEquationEntry[] = [];

  editor.equations.forEach((row, equationIndex) => {
    const name = row.name.trim();
    const expression = row.expression.trim();
    if (!name || !expression) {
      return;
    }

    try {
      parsedEquations.push({
        row,
        equationIndex,
        parsed: parseEquation(name, expression)
      });
    } catch (error) {
      errors.push(
        `Equation ${equationIndex + 1} (${name}): ${
          error instanceof Error ? error.message : "Unable to parse expression."
        }`
      );
    }
  });

  const endogenous = new Set(parsedEquations.map((entry) => entry.parsed.name));
  const externalRows = collectExternalRows(editor.externals);
  const externalNames = new Set(externalRows.map((row) => row.name));
  const initialValues = new Map<string, number>();

  editor.initialValues.forEach((row) => {
    const name = row.name.trim();
    const value = row.valueText.trim();
    if (!name || !value) {
      return;
    }
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      initialValues.set(name, parsed);
    }
  });

  const currentDependencyGraph = new Map<string, Set<string>>();
  parsedEquations.forEach((entry) => {
    currentDependencyGraph.set(
      entry.parsed.name,
      new Set(entry.parsed.currentDependencies.filter((dependency) => endogenous.has(dependency)))
    );
  });

  const components = buildComponents(currentDependencyGraph);
  const componentByName = new Map<string, number>();
  const componentCycleByName = new Map<string, boolean>();
  components.forEach((component) => {
    component.nodeNames.forEach((name) => {
      componentByName.set(name, component.id);
      componentCycleByName.set(name, component.cyclic);
    });
  });

  const incomingComponents = new Map<number, Set<number>>();
  const outgoingComponents = new Map<number, Set<number>>();
  components.forEach((component) => {
    incomingComponents.set(component.id, new Set<number>());
    outgoingComponents.set(component.id, new Set<number>());
  });

  currentDependencyGraph.forEach((dependencies, nodeName) => {
    const targetComponent = componentByName.get(nodeName);
    if (targetComponent == null) {
      return;
    }

    dependencies.forEach((dependencyName) => {
      const sourceComponent = componentByName.get(dependencyName);
      if (sourceComponent == null || sourceComponent === targetComponent) {
        return;
      }
      incomingComponents.get(targetComponent)?.add(sourceComponent);
      outgoingComponents.get(sourceComponent)?.add(targetComponent);
    });
  });

  const componentLayer = computeComponentLayers(components, incomingComponents, outgoingComponents);
  const stockNames = new Set<string>();
  parsedEquations.forEach((entry) => {
    if (inferVariableType(entry, endogenous, new Set<string>()) === "stock") {
      stockNames.add(entry.parsed.name);
    }
  });
  const flowCandidates = new Set<string>();

  parsedEquations.forEach((entry) => {
    if (!stockNames.has(entry.parsed.name)) {
      return;
    }
    entry.parsed.currentDependencies.forEach((dependency) => {
      if (dependency !== entry.parsed.name && endogenous.has(dependency)) {
        flowCandidates.add(dependency);
      }
    });
  });

  const nodeVariableTypes = new Map<string, VariableType>();
  const nodeEquationRoles = new Map<string, EquationRole | null>();
  parsedEquations.forEach((entry) => {
    nodeVariableTypes.set(entry.parsed.name, inferVariableType(entry, endogenous, flowCandidates));
    nodeEquationRoles.set(entry.parsed.name, inferEquationRole(entry));
  });

  const nodeDegrees = new Map<string, number>();
  const edgeMap = new Map<string, DependencyGraphEdge>();
  const nodeDescriptions = new Map<string, string>();

  parsedEquations.forEach((entry) => {
    if (entry.row.desc?.trim()) {
      nodeDescriptions.set(entry.parsed.name, entry.row.desc.trim());
    }
  });
  externalRows.forEach((row) => {
    if (row.desc?.trim()) {
      nodeDescriptions.set(row.name, row.desc.trim());
    }
  });

  parsedEquations.forEach((entry) => {
    const targetName = entry.parsed.name;
    const dependencyNames = new Set([
      ...entry.parsed.currentDependencies.filter(
        (dependency) => endogenous.has(dependency) || externalNames.has(dependency)
      ),
      ...entry.parsed.lagDependencies.filter(
        (dependency) => endogenous.has(dependency) || externalNames.has(dependency)
      )
    ]);

    dependencyNames.forEach((sourceName) => {
      if (sourceName === targetName) {
        return;
      }
      const key = `${sourceName}->${targetName}`;
      const existing = edgeMap.get(key);
      edgeMap.set(key, {
        id: key,
        sourceId: sourceName,
        targetId: targetName,
        current:
          (existing?.current ?? false) || entry.parsed.currentDependencies.includes(sourceName),
        lagged:
          (existing?.lagged ?? false) || entry.parsed.lagDependencies.includes(sourceName)
      });
      nodeDegrees.set(sourceName, (nodeDegrees.get(sourceName) ?? 0) + 1);
      nodeDegrees.set(targetName, (nodeDegrees.get(targetName) ?? 0) + 1);
    });
  });

  const nodes: DependencyGraphNode[] = [
    ...externalRows.map((row, index) => ({
      id: row.name,
      name: row.name,
      label: row.name,
      variableType: "exogenous" as const,
      equationRole: null,
      equationIndex: null,
      layer: 0,
      order: index,
      cluster: "exogenous" as const,
      degree: nodeDegrees.get(row.name) ?? 0,
      currentDependencyNames: [],
      lagDependencyNames: [],
      hasSelfLag: false,
      isCyclic: false,
      description: row.desc?.trim() || undefined,
      initialValue: initialValues.get(row.name)
    })),
    ...parsedEquations.map((entry) => ({
      id: entry.parsed.name,
      name: entry.parsed.name,
      label: entry.parsed.name,
      variableType: nodeVariableTypes.get(entry.parsed.name) ?? "auxiliary",
      equationRole: nodeEquationRoles.get(entry.parsed.name) ?? null,
      equationIndex: entry.equationIndex,
      layer: componentLayer.get(componentByName.get(entry.parsed.name) ?? -1) ?? 1,
      order: entry.equationIndex,
      cluster: "equation" as const,
      degree: nodeDegrees.get(entry.parsed.name) ?? 0,
      currentDependencyNames: entry.parsed.currentDependencies.filter(
        (dependency) => endogenous.has(dependency) || externalNames.has(dependency)
      ),
      lagDependencyNames: entry.parsed.lagDependencies.filter(
        (dependency) => endogenous.has(dependency) || externalNames.has(dependency)
      ),
      hasSelfLag: entry.parsed.lagDependencies.includes(entry.parsed.name),
      isCyclic: componentCycleByName.get(entry.parsed.name) ?? false,
      description: nodeDescriptions.get(entry.parsed.name),
      initialValue: initialValues.get(entry.parsed.name)
    }))
  ];

  const nodesByLayer = new Map<number, DependencyGraphNode[]>();
  nodes.forEach((node) => {
    const bucket = nodesByLayer.get(node.layer) ?? [];
    bucket.push(node);
    nodesByLayer.set(node.layer, bucket);
  });

  nodesByLayer.forEach((bucket) => {
    bucket.sort((left, right) => {
      const kindCompare =
        VARIABLE_TYPE_SORT_ORDER[left.variableType] - VARIABLE_TYPE_SORT_ORDER[right.variableType];
      if (kindCompare !== 0) {
        return kindCompare;
      }
      const leftIndex = left.equationIndex ?? -1;
      const rightIndex = right.equationIndex ?? -1;
      if (leftIndex !== rightIndex) {
        return leftIndex - rightIndex;
      }
      return left.name.localeCompare(right.name);
    });
    bucket.forEach((node, index) => {
      node.order = index;
    });
  });

  const sortedNodes = Array.from(nodes).sort((left, right) => {
    if (left.layer !== right.layer) {
      return left.layer - right.layer;
    }
    if (left.order !== right.order) {
      return left.order - right.order;
    }
    return left.name.localeCompare(right.name);
  });

  const sortedEdges = Array.from(edgeMap.values()).sort((left, right) => {
    if (left.sourceId !== right.sourceId) {
      return left.sourceId.localeCompare(right.sourceId);
    }
    return left.targetId.localeCompare(right.targetId);
  });

  return {
    nodes: sortedNodes,
    edges: sortedEdges,
    errors,
    layerCount:
      sortedNodes.reduce((maxLayer, node) => Math.max(maxLayer, node.layer), 0) + 1
  };
}

function collectExternalRows(rows: ExternalRow[]): Array<Pick<ExternalRow, "name" | "desc">> {
  const uniqueRows = new Map<string, Pick<ExternalRow, "name" | "desc">>();

  rows.forEach((row) => {
    const name = row.name.trim();
    if (!name || uniqueRows.has(name)) {
      return;
    }
    uniqueRows.set(name, {
      name,
      desc: row.desc?.trim() || undefined
    });
  });

  return Array.from(uniqueRows.values()).sort((left, right) => left.name.localeCompare(right.name));
}

function inferVariableType(
  entry: ParsedEquationEntry,
  endogenous: Set<string>,
  flowCandidates: Set<string>
): VariableType {
  const explicitStockFlow = entry.row.unitMeta?.stockFlow;
  if (explicitStockFlow === "stock") {
    return "stock";
  }
  if (explicitStockFlow === "flow") {
    return "flow";
  }
  if (explicitStockFlow === "aux") {
    return classifyVariableTypeLike(entry, endogenous, flowCandidates);
  }

  if (isStockEquation(entry.parsed)) {
    return "stock";
  }

  return classifyVariableTypeLike(entry, endogenous, flowCandidates);
}

function classifyVariableTypeLike(
  entry: ParsedEquationEntry,
  endogenous: Set<string>,
  flowCandidates: Set<string>
): VariableType {
  const currentEndogenousDependencies = entry.parsed.currentDependencies.filter((dependency) =>
    endogenous.has(dependency)
  );

  if (currentEndogenousDependencies.length === 0) {
    return "parameter";
  }
  if (flowCandidates.has(entry.parsed.name)) {
    return "flow";
  }
  return "auxiliary";
}

function inferEquationRole(entry: ParsedEquationEntry): EquationRole {
  return analyzeParsedEquation(entry.parsed, {
    description: entry.row.desc?.trim(),
    explicitRole: entry.row.role
  }).role;
}

function isStockEquation(parsed: ReturnType<typeof parseEquation>): boolean {
  return parsed.sourceExpression.type === "Integral" || parsed.lagDependencies.includes(parsed.name);
}

function buildComponents(graph: Map<string, Set<string>>): ComponentInfo[] {
  const indexByNode = new Map<string, number>();
  const lowLinkByNode = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const components: string[][] = [];
  let index = 0;

  function visit(node: string): void {
    indexByNode.set(node, index);
    lowLinkByNode.set(node, index);
    index += 1;
    stack.push(node);
    onStack.add(node);

    for (const dependency of graph.get(node) ?? []) {
      if (!indexByNode.has(dependency)) {
        visit(dependency);
        lowLinkByNode.set(
          node,
          Math.min(required(lowLinkByNode, node), required(lowLinkByNode, dependency))
        );
      } else if (onStack.has(dependency)) {
        lowLinkByNode.set(
          node,
          Math.min(required(lowLinkByNode, node), required(indexByNode, dependency))
        );
      }
    }

    if (required(lowLinkByNode, node) === required(indexByNode, node)) {
      const component: string[] = [];
      let current: string | undefined;
      do {
        current = stack.pop();
        if (current == null) {
          throw new Error("Tarjan stack underflow");
        }
        onStack.delete(current);
        component.push(current);
      } while (current !== node);
      components.push(component.sort((left, right) => left.localeCompare(right)));
    }
  }

  Array.from(graph.keys())
    .sort((left, right) => left.localeCompare(right))
    .forEach((node) => {
      if (!indexByNode.has(node)) {
        visit(node);
      }
    });

  return components
    .map((nodeNames, id) => ({
      id,
      nodeNames,
      cyclic:
        nodeNames.length > 1 ||
        (nodeNames.length === 1 && (graph.get(nodeNames[0])?.has(nodeNames[0]) ?? false))
    }))
    .sort((left, right) => {
      const leftFirst = left.nodeNames[0] ?? "";
      const rightFirst = right.nodeNames[0] ?? "";
      return leftFirst.localeCompare(rightFirst);
    })
    .map((component, id) => ({ ...component, id }));
}

function computeComponentLayers(
  components: ComponentInfo[],
  incomingComponents: Map<number, Set<number>>,
  outgoingComponents: Map<number, Set<number>>
): Map<number, number> {
  const remappedIncoming = remapComponentEdges(components, incomingComponents);
  const remappedOutgoing = remapComponentEdges(components, outgoingComponents);
  const indegree = new Map<number, number>();
  const layers = new Map<number, number>();

  components.forEach((component) => {
    indegree.set(component.id, remappedIncoming.get(component.id)?.size ?? 0);
    layers.set(component.id, 1);
  });

  const queue = components
    .filter((component) => (indegree.get(component.id) ?? 0) === 0)
    .sort(compareComponents);
  const pending = [...queue];

  while (pending.length > 0) {
    const component = pending.shift();
    if (!component) {
      break;
    }

    const currentLayer = layers.get(component.id) ?? 1;
    const outgoing = Array.from(remappedOutgoing.get(component.id) ?? [])
      .map((componentId) => components.find((candidate) => candidate.id === componentId))
      .filter((candidate): candidate is ComponentInfo => candidate != null)
      .sort(compareComponents);

    outgoing.forEach((nextComponent) => {
      layers.set(nextComponent.id, Math.max(layers.get(nextComponent.id) ?? 1, currentLayer + 1));
      const nextIndegree = (indegree.get(nextComponent.id) ?? 0) - 1;
      indegree.set(nextComponent.id, nextIndegree);
      if (nextIndegree === 0) {
        pending.push(nextComponent);
        pending.sort(compareComponents);
      }
    });
  }

  return layers;
}

function remapComponentEdges(
  components: ComponentInfo[],
  edges: Map<number, Set<number>>
): Map<number, Set<number>> {
  const remap = new Map<number, number>();
  components.forEach((component) => remap.set(component.id, component.id));
  const result = new Map<number, Set<number>>();

  components.forEach((component) => {
    result.set(component.id, new Set<number>(edges.get(component.id) ?? []));
  });

  return result;
}

function compareComponents(left: ComponentInfo, right: ComponentInfo): number {
  const leftFirst = left.nodeNames[0] ?? "";
  const rightFirst = right.nodeNames[0] ?? "";
  return leftFirst.localeCompare(rightFirst);
}

function required(map: Map<string, number>, key: string): number {
  const value = map.get(key);
  if (value == null) {
    throw new Error(`Missing graph value for ${key}`);
  }
  return value;
}
