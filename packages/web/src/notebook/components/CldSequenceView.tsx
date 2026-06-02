import { useMemo, useState } from "react";

import type { Loop } from "@sfcr/core";
import { formatSignedLoopPath } from "@sfcr/core";

import type { EditorState } from "../../lib/editorModel";
import { buildVariableUnitMetadata } from "../../lib/units";
import { buildVariableDescriptions, type VariableDescriptions } from "../../lib/variableDescriptions";
import { CldGraphCanvas } from "../../components/CldGraphCanvas";
import { VariableMathLabel } from "../../components/VariableMathLabel";
import { buildCldFromEditor } from "../cld";
import { buildEditorStateForNotebookModel } from "../modelSections";
import { NotebookRenderProfiler } from "../notebookProfiler";
import type { NotebookCell, SequenceCell } from "../types";
import { resolveInspectorModelSource, type VariableInspectRequest } from "../../lib/variableInspect";

export function CldSequenceView({
  cell,
  cells,
  getModelCurrentValues,
  onVariableInspectRequest,
  variableDescriptions
}: {
  cell: SequenceCell & {
    source: Extract<SequenceCell["source"], { kind: "cld" }>;
  };
  cells: NotebookCell[];
  getModelCurrentValues(ref: {
    modelId?: string;
    sourceModelId?: string;
    sourceModelCellId?: string;
  }): Record<string, number | undefined>;
  onVariableInspectRequest(args: VariableInspectRequest): void;
  variableDescriptions: VariableDescriptions;
}) {
  const [fitViewRequest, setFitViewRequest] = useState(0);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [hideLaggedLoops, setHideLaggedLoops] = useState(false);

  const modelEditor = useMemo(
    () =>
      buildEditorStateForNotebookModel(
        {
          id: "sequence-cld-view",
          title: "Causal loop diagram source",
          metadata: { version: 1 },
          cells
        },
        cell.source
      ),
    [cell.source, cells]
  );

  const cldVariableDescriptions = useMemo(
    () =>
      modelEditor
        ? buildVariableDescriptions({
            equations: modelEditor.equations,
            externals: modelEditor.externals
          })
        : variableDescriptions,
    [modelEditor, variableDescriptions]
  );

  const cldVariableUnitMetadata = useMemo(
    () =>
      modelEditor
        ? buildVariableUnitMetadata({
            equations: modelEditor.equations,
            externals: modelEditor.externals
          })
        : new Map(),
    [modelEditor]
  );

  const cld = useMemo(() => {
    const modelId = cell.source.modelId ?? cell.source.sourceModelId ?? null;
    return modelEditor
      ? buildCldFromEditor(modelEditor, {
          notebookCells: cells,
          modelId: typeof modelId === "string" ? modelId : undefined
        })
      : {
          links: [],
          mermaid: "flowchart TD\n",
          loops: [],
          loopSummary: "",
          errors: ["Causal loop diagram source model could not be resolved."]
        };
  }, [modelEditor]);

  const visibleLoops = useMemo(() => {
    if (!hideLaggedLoops) {
      return cld.loops;
    }
    return cld.loops.filter((loop) => !loop.edges.some((edge) => edge.lagged));
  }, [cld.loops, hideLaggedLoops]);

  const visibleLoopSummary = useMemo(() => {
    if (!hideLaggedLoops) {
      return cld.loopSummary;
    }
    // Recompute summary so numbering matches visible loops only.
    if (!visibleLoops.length) {
      return "";
    }
    let reinforcingIndex = 0;
    let balancingIndex = 0;
    const lines: string[] = [];
    for (const loop of visibleLoops) {
      const label =
        loop.polarity === "R"
          ? `R${++reinforcingIndex}`
          : `B${++balancingIndex}`;
      lines.push(`${label}: ${formatSignedLoopPath(loop)}`);
    }
    return lines.join("\n");
  }, [cld.loopSummary, hideLaggedLoops, visibleLoops]);

  function handleInspectVariable(name: string): void {
    if (!modelEditor) {
      return;
    }
    onVariableInspectRequest({
      currentValues: getModelCurrentValues(cell.source),
      editor: modelEditor,
      modelSource: resolveInspectorModelSource(cell.source),
      selectedVariable: name,
      variableDescriptions: cldVariableDescriptions,
      variableUnitMetadata: cldVariableUnitMetadata
    });
  }

  async function handleCopyMermaid(): Promise<void> {
    try {
      await navigator.clipboard.writeText(cld.mermaid);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
    window.setTimeout(() => setCopyState("idle"), 2000);
  }

  function renderLoopMath(loop: Loop) {
    if (!loop.edges.length) {
      return null;
    }

    const startEdge = loop.edges[0];
    const startLabel = startEdge?.lagged ? `${startEdge.from}_-1` : startEdge.from;

    return (
      <span className="cld-sequence-view__loop-math">
        <VariableMathLabel name={startLabel} />
        {loop.edges.map((edge, edgeIndex) => {
          const arrow = edge.lagged ? "⇢" : "➙";
          const nextEdge = loop.edges[edgeIndex + 1];
          const toLabel = nextEdge?.lagged ? `${edge.to}_-1` : edge.to;

          return (
            <span key={`${edge.from}-${edge.to}-${edgeIndex}`}>
              <span className="cld-sequence-view__loop-arrow">
                {" "}
                {edge.polarity}
                {arrow}{" "}
              </span>
              <VariableMathLabel name={toLabel} />
            </span>
          );
        })}
      </span>
    );
  }

  return (
    <NotebookRenderProfiler
      id="SequenceCldCellBody"
      metadata={{
        cellId: cell.id,
        cellType: cell.type,
        edgeCount: cld.links.length,
        loopCount: cld.loops.length,
        sourceKind: cell.source.kind
      }}
    >
      <div className="sequence-viewer cld-sequence-view">
        <div className="sequence-toolbar">
          <div className="sequence-toolbar-meta">
            <span>
              Links <strong>{cld.links.length}</strong>
            </span>
            <span>
              Loops <strong>{visibleLoops.length}</strong>
            </span>
          </div>
          <div className="sequence-toolbar-actions">
            <label className="sequence-toolbar-checkbox">
              <input
                type="checkbox"
                checked={hideLaggedLoops}
                onChange={(event) => setHideLaggedLoops(event.target.checked)}
              />
              Hide lagged loops
            </label>
            <button
              type="button"
              className="notebook-run-button"
              onClick={() => setFitViewRequest((value) => value + 1)}
            >
              Fit view
            </button>
            <button type="button" className="notebook-run-button" onClick={() => void handleCopyMermaid()}>
              {copyState === "copied"
                ? "Copied"
                : copyState === "failed"
                  ? "Copy failed"
                  : "Copy Mermaid"}
            </button>
          </div>
        </div>

        {cld.links.length > 0 ? (
          <div className="cld-sequence-view__canvas">
            <CldGraphCanvas
              links={cld.links}
              fitViewRequest={fitViewRequest}
              onNodeClick={handleInspectVariable}
            />
          </div>
        ) : (
          <p className="cld-sequence-view__empty">No endogenous causal links were inferred from the model equations.</p>
        )}

        {visibleLoopSummary ? (
          <section className="cld-sequence-view__loops" aria-label="Feedback loops">
            <h3 className="cld-sequence-view__loops-title">Feedback loops</h3>
            <ul className="cld-sequence-view__loop-list">
              {visibleLoops.map((loop, index) => (
                <li key={`${loop.polarity}-${index}`}>
                  <span className={`cld-sequence-view__loop-tag is-${loop.polarity.toLowerCase()}`}>
                    {loop.polarity}
                  </span>
                  {renderLoopMath(loop) ?? <span>{formatSignedLoopPath(loop)}</span>}
                </li>
              ))}
            </ul>
            <pre className="cld-sequence-view__loop-summary">{visibleLoopSummary}</pre>
          </section>
        ) : null}

        {cld.errors.length ? (
          <ul className="validation-list">
            {cld.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </NotebookRenderProfiler>
  );
}
