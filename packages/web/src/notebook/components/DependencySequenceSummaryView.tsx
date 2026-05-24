import { useMemo } from "react";

import { VariableLabel } from "../../components/VariableLabel";
import type { EditorState } from "../../lib/editorModel";
import { buildVariableUnitMetadata } from "../../lib/units";
import { buildVariableDescriptions, type VariableDescriptions } from "../../lib/variableDescriptions";
import { buildDependencyGraph } from "../dependencyGraph";
import { buildEditorStateForNotebookModel } from "../modelSections";
import { NotebookRenderProfiler } from "../notebookProfiler";
import type { NotebookCell, SequenceCell } from "../types";
import { resolveInspectorModelSource, type VariableInspectRequest } from "../../lib/variableInspect";

function filterDependencyGraphForView(
  graph: ReturnType<typeof buildDependencyGraph>,
  showExogenous: boolean
): ReturnType<typeof buildDependencyGraph> {
  if (showExogenous) {
    return graph;
  }

  const visibleNodes = graph.nodes.filter((node) => node.variableType !== "exogenous");
  const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));
  const visibleEdges = graph.edges.filter(
    (edge) => visibleNodeIds.has(edge.sourceId) && visibleNodeIds.has(edge.targetId)
  );
  const minLayer = visibleNodes.reduce((result, node) => Math.min(result, node.layer), Infinity);
  const normalizedNodes =
    Number.isFinite(minLayer) && minLayer > 0
      ? visibleNodes.map((node) => ({ ...node, layer: node.layer - minLayer }))
      : visibleNodes;

  return {
    nodes: normalizedNodes,
    edges: visibleEdges,
    errors: graph.errors,
    layerCount: normalizedNodes.reduce((maxLayer, node) => Math.max(maxLayer, node.layer), -1) + 1
  };
}

export function DependencySequenceSummaryView({
  cell,
  cells,
  getModelCurrentValues,
  onCellChange,
  onVariableInspectRequest,
  variableDescriptions
}: {
  cell: SequenceCell & {
    source: Extract<SequenceCell["source"], { kind: "dependency" }>;
  };
  cells: NotebookCell[];
  getModelCurrentValues(ref: {
    modelId?: string;
    sourceModelId?: string;
    sourceModelCellId?: string;
  }): Record<string, number | undefined>;
  onCellChange(cellId: string, updater: (cell: NotebookCell) => NotebookCell): void;
  onVariableInspectRequest(args: VariableInspectRequest): void;
  variableDescriptions: VariableDescriptions;
}) {
  const showExogenous = cell.source.showExogenous ?? false;

  function updateDependencySource(
    updater: (
      source: Extract<SequenceCell["source"], { kind: "dependency" }>
    ) => Extract<SequenceCell["source"], { kind: "dependency" }>
  ): void {
    onCellChange(cell.id, (current) => {
      if (current.type !== "sequence" || current.source.kind !== "dependency") {
        return current;
      }

      return {
        ...current,
        source: updater(current.source)
      };
    });
  }

  function togglePersistedExogenous(): void {
    updateDependencySource((source) => ({
      ...source,
      showExogenous: !(source.showExogenous ?? false)
    }));
  }

  const dependencyEditor = useMemo(
    () =>
      buildEditorStateForNotebookModel(
        {
          id: "sequence-dependency-view",
          title: "Dependency graph source",
          metadata: { version: 1 },
          cells
        },
        cell.source
      ),
    [cell.source, cells]
  );

  const dependencyVariableDescriptions = useMemo(
    () =>
      dependencyEditor
        ? buildVariableDescriptions({
            equations: dependencyEditor.equations,
            externals: dependencyEditor.externals
          })
        : variableDescriptions,
    [dependencyEditor, variableDescriptions]
  );

  const dependencyVariableUnitMetadata = useMemo(
    () =>
      dependencyEditor
        ? buildVariableUnitMetadata({
            equations: dependencyEditor.equations,
            externals: dependencyEditor.externals
          })
        : new Map(),
    [dependencyEditor]
  );

  const graph = useMemo(() => {
    return dependencyEditor
      ? buildDependencyGraph(dependencyEditor)
      : {
          nodes: [],
          edges: [],
          errors: ["Dependency graph source model could not be resolved."],
          layerCount: 0
        };
  }, [dependencyEditor]);

  const visibleGraph = useMemo(
    () => filterDependencyGraphForView(graph, showExogenous),
    [graph, showExogenous]
  );

  const nodesByLayer = useMemo(() => {
    const layers = new Map<number, typeof visibleGraph.nodes>();
    visibleGraph.nodes.forEach((node) => {
      const bucket = layers.get(node.layer) ?? [];
      bucket.push(node);
      layers.set(node.layer, bucket);
    });
    return Array.from(layers.entries()).sort(([left], [right]) => left - right);
  }, [visibleGraph.nodes]);

  function handleInspectVariable(name: string): void {
    if (!dependencyEditor) {
      return;
    }
    onVariableInspectRequest({
      currentValues: getModelCurrentValues(cell.source),
      editor: dependencyEditor,
      modelSource: resolveInspectorModelSource(cell.source),
      selectedVariable: name,
      variableDescriptions: dependencyVariableDescriptions,
      variableUnitMetadata: dependencyVariableUnitMetadata
    });
  }

  return (
    <NotebookRenderProfiler
      id="SequenceDependencyCellBody"
      metadata={{
        cellId: cell.id,
        cellType: cell.type,
        edgeCount: visibleGraph.edges.length,
        nodeCount: visibleGraph.nodes.length,
        sourceKind: cell.source.kind
      }}
    >
      <div className="sequence-viewer dependency-sequence-summary">
        <div className="sequence-toolbar">
          <div className="sequence-toolbar-meta">
            <span>
              Variables <strong>{visibleGraph.nodes.length}</strong>
            </span>
            <span>
              Links <strong>{visibleGraph.edges.length}</strong>
            </span>
            <span>
              Layers <strong>{visibleGraph.layerCount}</strong>
            </span>
          </div>
          <div className="sequence-toolbar-actions">
            <button
              type="button"
              className={`notebook-run-button notebook-source-toggle${
                showExogenous ? " is-active" : ""
              }`}
              onClick={togglePersistedExogenous}
            >
              {showExogenous ? "Hide exogenous" : "Show exogenous"}
            </button>
          </div>
        </div>

        <p className="dependency-sequence-summary__notice">
          The interactive dependency graph view has been removed. Use this list to inspect variables
          by layer. Transaction flows remain in the matrix sequence view.
        </p>

        <div className="dependency-sequence-summary__layers" role="region" aria-label="Equation dependency summary">
          {nodesByLayer.map(([layer, nodes]) => (
            <section key={layer} className="dependency-sequence-summary__layer">
              <h3 className="dependency-sequence-summary__layer-title">Layer {layer}</h3>
              <ul className="dependency-sequence-summary__variable-list">
                {nodes
                  .slice()
                  .sort((left, right) => left.name.localeCompare(right.name))
                  .map((node) => (
                    <li key={node.id}>
                      <button
                        type="button"
                        className="dependency-sequence-summary__inspect-button"
                        aria-label={`Inspect variable ${node.name}`}
                        onClick={() => handleInspectVariable(node.name)}
                      >
                        <VariableLabel name={node.label} />
                        <span className="dependency-sequence-summary__meta">
                          {node.variableType}
                          {node.isCyclic ? " · cyclic" : ""}
                        </span>
                      </button>
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </div>

        {visibleGraph.errors.length ? (
          <ul className="validation-list">
            {visibleGraph.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </NotebookRenderProfiler>
  );
}
