import type { ParsedEquation } from "../parser/parse";

export interface EquationBlock {
  id: number;
  equationNames: string[];
  cyclic: boolean;
}

export interface OrderedModel {
  equations: ParsedEquation[];
  blocks: EquationBlock[];
}

export function buildOrderedBlocks(parsed: ParsedEquation[]): OrderedModel {
  const dependencies = buildDependencyMap(parsed);
  const components = stronglyConnectedComponents(dependencies);
  const componentIndex = new Map<string, number>();

  components.forEach((component, index) => {
    for (const variable of component) {
      componentIndex.set(variable, index);
    }
  });

  const dag = new Map<number, Set<number>>();
  const indegree = new Map<number, number>();

  for (let index = 0; index < components.length; index += 1) {
    dag.set(index, new Set<number>());
    indegree.set(index, 0);
  }

  for (const [equationName, refs] of dependencies.entries()) {
    const from = componentIndex.get(equationName);
    if (from === undefined) {
      throw new Error(`Missing component index for equation: ${equationName}`);
    }

    for (const ref of refs) {
      const to = componentIndex.get(ref);
      if (to === undefined) {
        throw new Error(`Missing component index for dependency: ${ref}`);
      }

      if (from !== to) {
        const edges = dag.get(to);
        if (!edges) {
          throw new Error(`Missing DAG entry for component: ${to}`);
        }
        if (!edges.has(from)) {
          edges.add(from);
          indegree.set(from, (indegree.get(from) ?? 0) + 1);
        }
      }
    }
  }

  const queue = Array.from(indegree.entries())
    .filter(([, degree]) => degree === 0)
    .map(([component]) => component)
    .sort((a, b) => a - b);

  const blocks: EquationBlock[] = [];

  while (queue.length > 0) {
    const component = queue.shift();
    if (component === undefined) {
      break;
    }

    const variables = Array.from(components[component] ?? []).sort((a, b) => a.localeCompare(b));
    blocks.push({
      id: component,
      equationNames: variables,
      cyclic: variables.length > 1
    });

    const nextComponents = Array.from(dag.get(component) ?? []).sort((a, b) => a - b);
    for (const next of nextComponents) {
      const nextDegree = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, nextDegree);
      if (nextDegree === 0) {
        queue.push(next);
      }
    }
  }

  if (blocks.length !== components.length) {
    throw new Error("Dependency graph ordering failed");
  }

  return {
    equations: parsed,
    blocks
  };
}

function buildDependencyMap(parsed: ParsedEquation[]): Map<string, Set<string>> {
  const endogenous = new Set(parsed.map((equation) => equation.name));
  const dependencies = new Map<string, Set<string>>();

  for (const equation of parsed) {
    const refs = new Set(
      equation.currentDependencies.filter((dependency) => endogenous.has(dependency))
    );
    dependencies.set(equation.name, refs);
  }

  return dependencies;
}

function stronglyConnectedComponents(graph: Map<string, Set<string>>): string[][] {
  const tarjan = new Tarjan(graph);

  return tarjan.run().sort((left, right) => {
    const leftFirst = [...left].sort((a, b) => a.localeCompare(b))[0] ?? "";
    const rightFirst = [...right].sort((a, b) => a.localeCompare(b))[0] ?? "";
    return leftFirst.localeCompare(rightFirst);
  });
}

class Tarjan {
  private index = 0;
  private readonly indexByNode = new Map<string, number>();
  private readonly lowLinkByNode = new Map<string, number>();
  private readonly stack: string[] = [];
  private readonly onStack = new Set<string>();
  private readonly result: string[][] = [];

  constructor(private readonly graph: Map<string, Set<string>>) {}

  run(): string[][] {
    for (const node of this.graph.keys()) {
      if (!this.indexByNode.has(node)) {
        this.visit(node);
      }
    }
    return this.result;
  }

  private visit(node: string): void {
    this.indexByNode.set(node, this.index);
    this.lowLinkByNode.set(node, this.index);
    this.index += 1;
    this.stack.push(node);
    this.onStack.add(node);

    for (const neighbor of this.graph.get(node) ?? []) {
      if (!this.indexByNode.has(neighbor)) {
        this.visit(neighbor);
        this.lowLinkByNode.set(
          node,
          Math.min(this.requiredLowLink(node), this.requiredLowLink(neighbor))
        );
      } else if (this.onStack.has(neighbor)) {
        this.lowLinkByNode.set(
          node,
          Math.min(this.requiredLowLink(node), this.requiredIndex(neighbor))
        );
      }
    }

    if (this.requiredLowLink(node) === this.requiredIndex(node)) {
      const component: string[] = [];
      let current: string | undefined;

      do {
        current = this.stack.pop();
        if (current === undefined) {
          throw new Error("Tarjan stack underflow");
        }
        this.onStack.delete(current);
        component.push(current);
      } while (current !== node);

      this.result.push(component);
    }
  }

  private requiredIndex(node: string): number {
    const value = this.indexByNode.get(node);
    if (value === undefined) {
      throw new Error(`Missing index for node: ${node}`);
    }
    return value;
  }

  private requiredLowLink(node: string): number {
    const value = this.lowLinkByNode.get(node);
    if (value === undefined) {
      throw new Error(`Missing low-link for node: ${node}`);
    }
    return value;
  }
}
