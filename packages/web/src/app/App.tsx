import { useEffect, useState } from "react";

import {
  bmwBaselineModel,
  bmwBaselineOptions,
  simBaselineModel,
  simBaselineOptions,
  simGovernmentSpendingShock,
  type SimulationOptions
} from "@sfcr/core";

import { EquationGridEditor } from "../components/EquationGridEditor";
import { ErrorPanel } from "../components/ErrorPanel";
import { ExternalEditor } from "../components/ExternalEditor";
import { InitialValuesEditor } from "../components/InitialValuesEditor";
import { ImportExportPanel } from "../components/ImportExportPanel";
import { PeriodScrubber } from "../components/PeriodScrubber";
import { ResultChart, type ChartAxisMode } from "../components/ResultChart";
import { ResultTable } from "../components/ResultTable";
import { AssistantMarkdown } from "../components/AssistantMarkdown";
import { ScenarioEditor } from "../components/ScenarioEditor";
import { SolverPanel } from "../components/SolverPanel";
import { ValidationSummary } from "../components/ValidationSummary";
import { VariableInspector } from "../components/VariableInspector";
import { useDragScroll } from "../hooks/useDragScroll";
import { usePanelSplitter } from "../hooks/usePanelSplitter";
import { useSolver } from "../hooks/useSolver";
import { NotebookApp } from "../notebook/NotebookApp";
import { notebookFromJson, notebookToJson } from "../notebook/document";
import { buildEditorStateForNotebookModel } from "../notebook/modelSections";
import type { NotebookDocument } from "../notebook/types";
import { useAppRoute } from "./routes";
import {
  buildRuntimeConfig,
  diagnoseBuildRuntime,
  editorStateFromJson,
  editorStateFromModel,
  runtimeDocumentToJson,
  validateEditorState,
  type EditorOptions,
  type EditorState,
  type EquationRow,
  type ExternalRow,
  type InitialValueRow,
  type RuntimeDocument
} from "../lib/editorModel";
import type { UnitMeta } from "../lib/unitMeta";
import { buildVariableDescriptions, getVariableDescription } from "../lib/variableDescriptions";
import { buildVariableInspectorData } from "../lib/variableInspector";
import { buildVariableUnitMetadata } from "../lib/units";

import "../styles/app.css";

type PresetId = "sim" | "bmw";

const BMW_DESCRIPTIONS: Record<string, string> = {
  AF: "Amortization funds",
  Cd: "Consumption goods demand by households",
  Cs: "Consumption goods supply",
  DA: "Depreciation allowance",
  K: "Stock of capital",
  KT: "Target stock of capital",
  Ld: "Demand for bank loans",
  Ls: "Supply of bank loans",
  Id: "Demand for investment goods",
  Is: "Supply of investment goods",
  Mh: "Bank deposits held by households",
  Ms: "Supply of bank deposits",
  Nd: "Demand for labor",
  Ns: "Supply of labor",
  W: "Wage rate",
  WBd: "Wage bill - demand",
  WBs: "Wage bill - supply",
  Y: "Income = GDP",
  YD: "Disposable income of households",
  rm: "Rate of interest on bank deposits"
};

const BMW_EXTERNAL_DESCRIPTIONS: Record<string, string> = {
  alpha0: "Exogenous component in consumption",
  alpha1: "Propensity to consume out of income",
  alpha2: "Propensity to consume out of wealth",
  delta: "Depreciation rate",
  gamma: "Speed of adjustment of capital to its target value",
  kappa: "Capital-output ratio",
  pr: "Labor productivity",
  rl: "Rate of interest on bank loans, set exogenously"
};

const BMW_EQUATION_UNITS: Record<string, UnitMeta> = {
  AF: { stockFlow: "flow", signature: { money: 1, time: -1 } },
  Cd: { stockFlow: "flow", signature: { money: 1, time: -1 } },
  Cs: { stockFlow: "flow", signature: { money: 1, time: -1 } },
  DA: { stockFlow: "flow", signature: { money: 1, time: -1 } },
  Id: { stockFlow: "flow", signature: { money: 1, time: -1 } },
  Is: { stockFlow: "flow", signature: { money: 1, time: -1 } },
  K: { stockFlow: "stock", signature: { money: 1 } },
  KT: { stockFlow: "stock", signature: { money: 1 } },
  Ld: { stockFlow: "stock", signature: { money: 1 } },
  Ls: { stockFlow: "stock", signature: { money: 1 } },
  Mh: { stockFlow: "stock", signature: { money: 1 } },
  Ms: { stockFlow: "stock", signature: { money: 1 } },
  Nd: { stockFlow: "flow", signature: { items: 1, time: -1 } },
  Ns: { stockFlow: "flow", signature: { items: 1, time: -1 } },
  W: { stockFlow: "aux", signature: { money: 1, items: -1 } },
  WBd: { stockFlow: "flow", signature: { money: 1, time: -1 } },
  WBs: { stockFlow: "flow", signature: { money: 1, time: -1 } },
  Y: { stockFlow: "flow", signature: { money: 1, time: -1 } },
  YD: { stockFlow: "flow", signature: { money: 1, time: -1 } },
  rm: { stockFlow: "aux", signature: { time: -1 } }
};

const BMW_EXTERNAL_UNITS: Record<string, UnitMeta> = {
  alpha0: { stockFlow: "aux", signature: { money: 1, time: -1 } },
  alpha1: { stockFlow: "aux", signature: {} },
  alpha2: { stockFlow: "aux", signature: { time: -1 } },
  delta: { stockFlow: "aux", signature: { time: -1 } },
  gamma: { stockFlow: "aux", signature: { time: -1 } },
  kappa: { stockFlow: "aux", signature: { time: 1 } },
  pr: { stockFlow: "aux", signature: { money: 1, items: -1 } },
  rl: { stockFlow: "aux", signature: { time: -1 } }
};

const PRESETS: PresetConfig[] = [
  {
    id: "sim",
    label: "SIM baseline / scenario",
    editor: editorStateFromModel(simBaselineModel, simBaselineOptions, simGovernmentSpendingShock),
    highlights: ["Y", "Cd", "Hh", "Hs", "TXd"]
  },
  {
    id: "bmw",
    label: "BMW baseline",
    editor: withEditorDescriptions(
      editorStateFromModel(bmwBaselineModel, bmwBaselineOptions, null),
      BMW_DESCRIPTIONS,
      BMW_EXTERNAL_DESCRIPTIONS,
      BMW_EQUATION_UNITS,
      BMW_EXTERNAL_UNITS
    ),
    highlights: ["Y", "Cd", "Id", "K", "Mh", "W"]
  }
];

interface PresetConfig {
  id: PresetId;
  label: string;
  editor: EditorState;
  highlights: string[];
}

export function App() {
  const route = useAppRoute();

  if (route === "chat-builder") {
    return <ChatBuilderApp />;
  }

  if (route === "notebook") {
    return <NotebookApp />;
  }

  return <WorkspaceApp />;
}

export function WorkspaceApp() {
  const [presetId, setPresetId] = useState<PresetId>("sim");
  const [editor, setEditor] = useState<EditorState>(() =>
    editorStateFromModel(simBaselineModel, simBaselineOptions, simGovernmentSpendingShock)
  );
  const [importText, setImportText] = useState("");
  const [uiMessage, setUiMessage] = useState<string | null>(null);
  const [selectedChartVariables, setSelectedChartVariables] = useState<string[]>([
    "Y",
    "Cd",
    "Hh"
  ]);
  const [chartAxisMode, setChartAxisMode] = useState<ChartAxisMode>("shared");
  const [selectedPeriodIndex, setSelectedPeriodIndex] = useState(0);
  const [selectedVariable, setSelectedVariable] = useState<string | null>(null);
  const solver = useSolver();
  const validationIssues = validateEditorState(editor);
  const buildDiagnostics = diagnoseBuildRuntime(editor);
  const allIssues = [...validationIssues, ...buildDiagnostics.issues];
  const blockingIssues = allIssues.filter((issue) => (issue.severity ?? "error") === "error");
  const issueMap = Object.fromEntries(allIssues.map((issue) => [issue.path, issue.message]));
  const equationIssueMap = Object.fromEntries(
    allIssues
      .filter((issue) => issue.path.startsWith("equations."))
      .map((issue) => [issue.path, issue])
  );
  const variableDescriptions = buildVariableDescriptions({
    equations: editor.equations,
    externals: editor.externals
  });
  const variableUnitMetadata = buildVariableUnitMetadata({
    equations: editor.equations,
    externals: editor.externals
  });

  const preset = PRESETS.find((entry) => entry.id === presetId) ?? PRESETS[0];
  let runtime: RuntimeDocument | null;
  try {
    runtime = buildRuntimeConfig(editor);
  } catch (error) {
    runtime = null;
  }

  const resultRows = solver.result
    ? Object.entries(solver.result.series)
        .map(([name, values]) => ({
          description: getVariableDescription(variableDescriptions, name),
          name,
          selected: values[Math.min(selectedPeriodIndex, values.length - 1)] ?? NaN,
          start: values[0] ?? NaN,
          end: values[values.length - 1] ?? NaN
        }))
        .sort((left, right) => left.name.localeCompare(right.name))
    : [];

  const highlightRows = resultRows.filter((row) => preset.highlights.includes(row.name));
  const chartSeries = solver.result
    ? selectedChartVariables
        .map((name) => ({
          name,
          values: Array.from(solver.result?.series[name] ?? [])
        }))
        .filter((entry) => entry.values.length > 0)
    : [];
  const maxResultPeriodIndex = solver.result
    ? Math.max(
        0,
        ...Object.values(solver.result.series).map((values) => Math.max(values.length - 1, 0))
      )
    : 0;
  const currentValueMap = solver.result
    ? Object.fromEntries(
        Object.entries(solver.result.series).map(([name, values]) => [
          name,
          values[Math.min(selectedPeriodIndex, Math.max(values.length - 1, 0))]
        ])
      )
    : {};
  const selectedVariableData = buildVariableInspectorData({
    currentValues: currentValueMap,
    editor,
    selectedVariable,
    variableDescriptions,
    variableUnitMetadata
  });
  const workspaceMainDragScroll = useDragScroll<HTMLDivElement>();
  const workspaceSidebarDragScroll = useDragScroll<HTMLElement>();
  const workspacePanelSplitter = usePanelSplitter({
    defaultLeftWidthPercent: 57,
    minLeftWidthPx: 520,
    minRightWidthPx: 360,
    storageKey: "sfcr:workspace-panel-split"
  });

  useEffect(() => {
    setSelectedPeriodIndex((current) => Math.min(current, maxResultPeriodIndex));
  }, [maxResultPeriodIndex]);

  async function handleValidate(): Promise<void> {
    try {
      const nextRuntime = buildRuntimeConfig(editor);
      setUiMessage(null);
      await solver.validate(nextRuntime.model, nextRuntime.options);
      setUiMessage("Validation passed.");
    } catch (error) {
      setUiMessage(error instanceof Error ? error.message : "Unknown validation error");
    }
  }

  async function handleBaseline(): Promise<void> {
    try {
      const nextRuntime = buildRuntimeConfig(editor);
      setUiMessage(null);
      await solver.runBaseline(nextRuntime.model, nextRuntime.options);
    } catch (error) {
      setUiMessage(error instanceof Error ? error.message : "Unknown baseline error");
    }
  }

  async function handleScenario(): Promise<void> {
    try {
      const nextRuntime = buildRuntimeConfig(editor);
      if (!nextRuntime.scenario) {
        setUiMessage("No scenario shocks are defined.");
        return;
      }
      setUiMessage(null);
      const baseline = await solver.runBaseline(nextRuntime.model, nextRuntime.options);
      await solver.runScenario(
        nextRuntime.model,
        baseline,
        nextRuntime.scenario,
        nextRuntime.options
      );
    } catch (error) {
      setUiMessage(error instanceof Error ? error.message : "Unknown scenario error");
    }
  }

  function handleImportJson(): void {
    try {
      const nextEditor = editorStateFromJson(importText);
      setEditor(nextEditor);
      setUiMessage("Imported JSON document.");
    } catch (error) {
      setUiMessage(error instanceof Error ? error.message : "Invalid JSON import");
    }
  }

  function handleExportJson(): void {
    try {
      const json = runtimeDocumentToJson(editor);
      setImportText(json);
      navigator.clipboard
        .writeText(json)
        .then(() => setUiMessage("Exported JSON to the text area and clipboard."))
        .catch(() => setUiMessage("Exported JSON to the text area."));
    } catch (error) {
      setUiMessage(error instanceof Error ? error.message : "Unable to export JSON");
    }
  }

  async function handleImportFile(file: File): Promise<void> {
    try {
      const text = await file.text();
      const nextEditor = editorStateFromJson(text);
      setImportText(text);
      setEditor(nextEditor);
      setUiMessage(`Imported ${file.name}.`);
    } catch (error) {
      setUiMessage(error instanceof Error ? error.message : "Unable to import file");
    }
  }

  function handleDownloadJson(): void {
    try {
      const json = runtimeDocumentToJson(editor);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${presetId}-model.json`;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setUiMessage("Downloaded JSON document.");
    } catch (error) {
      setUiMessage(error instanceof Error ? error.message : "Unable to download JSON");
    }
  }

  function handlePresetChange(nextPresetId: PresetId): void {
    setPresetId(nextPresetId);
    const nextPreset = PRESETS.find((entry) => entry.id === nextPresetId);
    if (nextPreset) {
      setEditor(nextPreset.editor);
      setUiMessage(null);
    }
  }

  const canRunScenario =
    runtime?.scenario != null && blockingIssues.length === 0 && !buildDiagnostics.modelError;
  const canRunBaseline = runtime != null && blockingIssues.length === 0 && !buildDiagnostics.modelError;

  const statusMessage = uiMessage ?? solver.error?.message ?? null;

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <div className="app-kicker">Stock-flow consistent model workbench</div>
          <h1>sfcr Browser Workspace</h1>
          <p>
            Run the TypeScript solver core in the browser, inspect equations in a dedicated side
            panel, and compare baseline or scenario runs without leaving the page.
          </p>
        </div>

        <div className="app-header-stats" aria-label="Workspace statistics">
          <div className="hero-stat">
            <span className="hero-stat-label">Equations</span>
            <strong>{editor.equations.length}</strong>
          </div>
          <div className="hero-stat">
            <span className="hero-stat-label">Externals</span>
            <strong>{editor.externals.length}</strong>
          </div>
          <div className="hero-stat">
            <span className="hero-stat-label">Shocks</span>
            <strong>{editor.scenario.shocks.length}</strong>
          </div>
        </div>
      </header>

      <nav className="mode-switch" aria-label="Application modes">
        <a className="mode-switch-link is-active" href="#/workspace">
          Workspace
        </a>
        <a className="mode-switch-link" href="#/chat-builder">
          Chat builder
        </a>
        <a className="mode-switch-link" href="#/notebook">
          Notebook
        </a>
      </nav>

      <div
        ref={workspacePanelSplitter.layoutRef}
        className="workspace-layout"
      >
        <div
          ref={workspaceMainDragScroll.dragScrollRef}
          className={`workspace-main ${workspaceMainDragScroll.dragScrollProps.className}`}
          onClickCapture={workspaceMainDragScroll.dragScrollProps.onClickCapture}
          onMouseDown={workspaceMainDragScroll.dragScrollProps.onMouseDown}
        >
          <EquationGridEditor
            buildError={buildDiagnostics.modelError}
            currentValues={currentValueMap}
            equations={editor.equations}
            issues={equationIssueMap}
            onChange={(equations) => setEditor((current) => ({ ...current, equations }))}
            onSelectVariable={setSelectedVariable}
            parameterNames={editor.externals.map((external) => external.name)}
            variableDescriptions={variableDescriptions}
            variableUnitMetadata={variableUnitMetadata}
          />
          <ExternalEditor
            currentValues={currentValueMap}
            externals={editor.externals}
            issues={issueMap}
            onChange={(externals) => setEditor((current) => ({ ...current, externals }))}
          />
          <InitialValuesEditor
            currentValues={currentValueMap}
            initialValues={editor.initialValues}
            issues={issueMap}
            onChange={(initialValues) => setEditor((current) => ({ ...current, initialValues }))}
            variableUnitMetadata={variableUnitMetadata}
          />
          <ScenarioEditor
            scenario={editor.scenario}
            issues={issueMap}
            onChange={(scenario) => setEditor((current) => ({ ...current, scenario }))}
          />

          {solver.result ? (
            <>
              <PeriodScrubber
                maxIndex={maxResultPeriodIndex}
                onChange={setSelectedPeriodIndex}
                selectedIndex={selectedPeriodIndex}
              />
              <ResultChart
                axisMode={chartAxisMode}
                selectedIndex={selectedPeriodIndex}
                series={chartSeries}
                variableDescriptions={variableDescriptions}
                variableUnitMetadata={variableUnitMetadata}
              />
              <ResultTable
                onSelectVariable={setSelectedVariable}
                title="All Series"
                rows={resultRows}
                selectedIndex={selectedPeriodIndex}
                variableDescriptions={variableDescriptions}
                variableUnitMetadata={variableUnitMetadata}
              />
            </>
          ) : null}
        </div>

        <div {...workspacePanelSplitter.splitterProps} />

        <aside
          ref={workspaceSidebarDragScroll.dragScrollRef}
          className={`workspace-sidebar ${workspaceSidebarDragScroll.dragScrollProps.className}`}
          onClickCapture={workspaceSidebarDragScroll.dragScrollProps.onClickCapture}
          onMouseDown={workspaceSidebarDragScroll.dragScrollProps.onMouseDown}
        >
          <VariableInspector
            currentValues={currentValueMap}
            data={selectedVariableData}
            onSelectVariable={setSelectedVariable}
            variableDescriptions={variableDescriptions}
            variableUnitMetadata={variableUnitMetadata}
          />

          <section className="control-panel">
            <div className="panel-header">
              <div>
                <h2>Run Controls</h2>
                <p className="panel-subtitle">Preset selection, execution, and chart focus.</p>
              </div>
            </div>

            <label className="field">
              <span>Model preset</span>
              <select
                value={presetId}
                onChange={(event) => handlePresetChange(event.target.value as PresetId)}
              >
                {PRESETS.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="meta-panel">
              <div>Status: {solver.status}</div>
              <div>Baseline ready: {canRunBaseline ? "yes" : "no"}</div>
              <div>Scenario ready: {canRunScenario ? "yes" : "no"}</div>
            </div>

            <div className="button-row">
              <button type="button" onClick={handleValidate} disabled={solver.status === "running"}>
                Validate
              </button>
              <button
                type="button"
                onClick={handleBaseline}
                disabled={solver.status === "running" || !canRunBaseline}
              >
                Run baseline
              </button>
              <button
                type="button"
                onClick={handleScenario}
                disabled={solver.status === "running" || !canRunScenario}
              >
                Run scenario
              </button>
            </div>

            {runtime == null ? (
              <div className="status-hint">Current editor state has invalid numeric values.</div>
            ) : null}

            {solver.result ? (
              <>
                <label className="field">
                  <span>Chart variables</span>
                  <input
                    value={selectedChartVariables.join(", ")}
                    onChange={(event) =>
                      setSelectedChartVariables(
                        event.target.value
                          .split(",")
                          .map((value) => value.trim())
                          .filter((value) => value !== "")
                      )
                    }
                    placeholder="Y, Cd, Hh"
                  />
                </label>

                <label className="field">
                  <span>Left axis mode</span>
                  <select
                    value={chartAxisMode}
                    onChange={(event) => setChartAxisMode(event.target.value as ChartAxisMode)}
                  >
                    <option value="shared">Shared axis</option>
                    <option value="separate">One axis per series</option>
                  </select>
                </label>
              </>
            ) : null}
          </section>

          <SolverPanel
            options={editor.options}
            issues={issueMap}
            onChange={(options) => setEditor((current) => ({ ...current, options }))}
          />

          <ErrorPanel message={statusMessage} />
          <ValidationSummary issues={allIssues} />

          <ImportExportPanel
            importText={importText}
            onImportTextChange={setImportText}
            onImportJson={handleImportJson}
            onExportJson={handleExportJson}
            onImportFile={handleImportFile}
            onDownloadJson={handleDownloadJson}
          />

          {solver.result ? (
            <ResultTable
              title="Highlighted Variables"
              rows={highlightRows}
              selectedIndex={selectedPeriodIndex}
              variableDescriptions={variableDescriptions}
              variableUnitMetadata={variableUnitMetadata}
            />
          ) : null}
        </aside>
      </div>
    </main>
  );
}

interface ChatMessage {
  id: string;
  role: "assistant" | "user";
  text: string;
}

const CHAT_BUILDER_SAMPLE_MESSAGES: ChatMessage[] = [
  {
    id: "assistant-1",
    role: "assistant",
    text:
      "Describe the SFC model you want to build or paste the current draft you want to revise. This experimental surface will turn the conversation into notebook model sections rather than freeform JSON."
  },
  {
    id: "user-1",
    role: "user",
    text:
      "Build a simple closed-economy model with household consumption out of income and wealth, plus a government spending shock scenario."
  },
  {
    id: "assistant-2",
    role: "assistant",
    text:
      "The draft preview on the right shows the model sections this route will own first: equations, solver options, externals, initial values, and a baseline run. Validation and repair will run before anything is applied to a notebook."
  }
];

const CHAT_BUILDER_SECTION_NAMES = [
  "Equations",
  "Solver options",
  "Externals",
  "Initial values",
  "Baseline run",
  "Chart preview"
];

interface ChatBuilderDraftPlan {
  assistantText: string;
  equations: EquationRow[];
  externals: ExternalRow[];
  initialValues: InitialValueRow[];
  notebookDocument: NotebookDocument | null;
  sections: string[];
  solverOptions: Partial<EditorOptions> | null;
  summary: string;
}

const CHAT_BUILDER_INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: "assistant-1",
    role: "assistant",
    text:
      "Describe the SFC model you want to build or paste the current draft you want to revise. This experimental surface will turn the conversation into notebook model sections rather than freeform JSON."
  }
];

const CHAT_BUILDER_MODEL_STORAGE_KEY = "sfcr:chat-builder-model";
const CHAT_BUILDER_DEFAULT_MODEL = "gpt-4.1";
const CHAT_BUILDER_DEFAULT_SOLVER_OPTIONS: EditorOptions = {
  periods: 100,
  solverMethod: "GAUSS_SEIDEL",
  toleranceText: "1e-15",
  maxIterations: 200,
  defaultInitialValueText: "1e-15",
  hiddenLeftVariable: "",
  hiddenRightVariable: "",
  hiddenToleranceText: "0.00001",
  relativeHiddenTolerance: false
};

const APP_BASE_URL = import.meta.env.BASE_URL;
const CHAT_BUILDER_API_URL = resolveChatBuilderApiUrl();

function resolveChatBuilderApiUrl(): string {
  const configuredUrl = (import.meta.env.VITE_CHAT_BUILDER_API_URL ?? "").trim();
  if (configuredUrl) {
    return configuredUrl;
  }

  if (
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
  ) {
    return "http://localhost:8787/v1/chat-builder/draft";
  }

  return "";
}

function resolveAppResourceUrl(path: string): string {
  return new URL(`${APP_BASE_URL}${path.replace(/^\/+/, "")}`, window.location.origin).toString();
}

async function requestChatBuilderDraft(args: {
  betaPassword: string;
  model: string;
  messages: ChatMessage[];
  onTextDelta?: (delta: string) => void;
  prompt: string;
}): Promise<ChatBuilderDraftPlan> {
  if (!CHAT_BUILDER_API_URL) {
    throw new Error("Chat builder API endpoint is not configured.");
  }

  const response = await fetch(CHAT_BUILDER_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      ...(args.betaPassword.trim() ? { betaPassword: args.betaPassword.trim() } : {}),
      discoveryUrl: resolveAppResourceUrl(".well-known/sfcr.json"),
      model: args.model,
      messages: args.messages.map((message) => ({
        role: message.role,
        text: message.text
      })),
      prompt: args.prompt
    })
  });

  if (!response.ok) {
    let message = "Failed to start draft request.";

    try {
      const error = (await response.json()) as {
        error?: string | {
          message?: string;
        };
      };
      message =
        typeof error.error === "string"
          ? error.error
          : error.error?.message ?? message;
    } catch {
      // Ignore secondary parsing failures and preserve the fallback error message.
    }

    throw new Error(message);
  }

  const contentType = response.headers.get("Content-Type") ?? "";
  if (response.body && contentType.includes("text/event-stream")) {
    const streamedText = await readChatBuilderSseResponse(response, args.onTextDelta);
    if (streamedText.trim() !== "") {
      return normalizeChatBuilderDraftPlan(streamedText.trim());
    }
  }

  const result = (await response.json()) as {
    output?: Array<{
      content?: Array<{
        type?: string;
        text?: string;
      }>;
    }>;
    output_text?: string;
  };

  if (typeof result.output_text === "string" && result.output_text.trim() !== "") {
    return normalizeChatBuilderDraftPlan(result.output_text.trim());
  }

  const contentText = result.output
    ?.flatMap((entry) => entry.content ?? [])
    .find((entry) => typeof entry.text === "string" && entry.text.trim() !== "")?.text;

  if (typeof contentText === "string" && contentText.trim() !== "") {
    return normalizeChatBuilderDraftPlan(contentText.trim());
  }

  throw new Error("The model response did not include any assistant text.");
}

async function readChatBuilderSseResponse(
  response: Response,
  onTextDelta: ((delta: string) => void) | undefined
): Promise<string> {
  if (!response.body) {
    return "";
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";

    for (const chunk of chunks) {
      const eventText = parseChatBuilderSseChunk(chunk);
      if (eventText) {
        text += eventText;
        onTextDelta?.(eventText);
      }
    }
  }

  buffer += decoder.decode();
  const remainingText = parseChatBuilderSseChunk(buffer);
  if (remainingText) {
    text += remainingText;
    onTextDelta?.(remainingText);
  }

  return text;
}

function parseChatBuilderSseChunk(chunk: string): string {
  const dataLines = chunk
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart());

  let text = "";
  for (const data of dataLines) {
    if (!data || data === "[DONE]") {
      continue;
    }

    try {
      const event = JSON.parse(data) as {
        delta?: unknown;
        item?: unknown;
        output?: unknown;
        response?: unknown;
        text?: unknown;
        type?: unknown;
      };

      if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
        text += event.delta;
      }
    } catch {
      // Ignore malformed stream frames and continue reading later frames.
    }
  }

  return text;
}

function normalizeChatBuilderDraftPlan(rawText: string): ChatBuilderDraftPlan {
  const notebookJson = extractJsonObjectText(rawText);
  if (notebookJson) {
    try {
      const notebookDocument = notebookFromJson(notebookJson);
      const editor = extractPrimaryEditorStateFromNotebook(notebookDocument);
      return {
        assistantText: `Generated notebook: ${notebookDocument.title}`,
        equations: editor?.equations ?? [],
        externals: editor?.externals ?? [],
        initialValues: editor?.initialValues ?? [],
        notebookDocument,
        summary: summarizeNotebookDocument(notebookDocument),
        sections: inferNotebookSections(notebookDocument),
        solverOptions: editor?.options ?? null
      };
    } catch {
      // Fall through to legacy draft-plan parsing.
    }
  }

  try {
    const parsed = JSON.parse(rawText) as {
      assistantText?: unknown;
      equations?: unknown;
      externals?: unknown;
      initialValues?: unknown;
      summary?: unknown;
      sections?: unknown;
      solverOptions?: unknown;
    };

    const assistantText =
      typeof parsed.assistantText === "string" && parsed.assistantText.trim() !== ""
        ? parsed.assistantText.trim()
        : typeof parsed.summary === "string" && parsed.summary.trim() !== ""
          ? parsed.summary.trim()
          : rawText;

    const summary =
      typeof parsed.summary === "string" && parsed.summary.trim() !== ""
        ? parsed.summary.trim()
        : assistantText;

    const sections = Array.isArray(parsed.sections)
      ? parsed.sections
          .filter((value): value is string => typeof value === "string")
          .map((value) => value.trim())
          .filter((value) => value !== "")
      : [];

    const equations = Array.isArray(parsed.equations)
      ? parsed.equations.flatMap((entry, index) => normalizeDraftEquation(entry, index))
      : [];

    const externals = Array.isArray(parsed.externals)
      ? parsed.externals.flatMap((entry, index) => normalizeDraftExternal(entry, index))
      : [];

    const initialValues = Array.isArray(parsed.initialValues)
      ? parsed.initialValues.flatMap((entry, index) => normalizeDraftInitialValue(entry, index))
      : [];

    const solverOptions = normalizeDraftSolverOptions(parsed.solverOptions);

    return {
      assistantText,
      equations,
      externals,
      initialValues,
      notebookDocument: null,
      summary,
      sections: sections.length > 0 ? sections : inferDraftSections({ equations, externals, initialValues, solverOptions }),
      solverOptions
    };
  } catch {
    return {
      assistantText: rawText,
      equations: [],
      externals: [],
      initialValues: [],
      notebookDocument: null,
      summary: rawText,
      sections: CHAT_BUILDER_SECTION_NAMES,
      solverOptions: null
    };
  }
}

function extractJsonObjectText(rawText: string): string | null {
  const trimmed = rawText.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  const candidate = fenceMatch?.[1]?.trim() ?? trimmed;

  if (candidate.startsWith("{") && candidate.endsWith("}")) {
    return candidate;
  }

  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return candidate.slice(start, end + 1);
  }

  return null;
}

function extractPrimaryEditorStateFromNotebook(document: NotebookDocument): EditorState | null {
  const runCell = document.cells.find((cell) => cell.type === "run");
  if (runCell?.type === "run") {
    const editor = buildEditorStateForNotebookModel(document, runCell);
    if (editor) {
      return editor;
    }
  }

  const equationsCell = document.cells.find((cell) => cell.type === "equations");
  if (equationsCell?.type === "equations") {
    return buildEditorStateForNotebookModel(document, { modelId: equationsCell.modelId });
  }

  const legacyModelCell = document.cells.find((cell) => cell.type === "model");
  return legacyModelCell?.type === "model" ? legacyModelCell.editor : null;
}

function inferNotebookSections(document: NotebookDocument): string[] {
  const sections = document.cells.map((cell) => cell.title.trim()).filter(Boolean);
  return sections.length > 0 ? sections : CHAT_BUILDER_SECTION_NAMES;
}

function summarizeNotebookDocument(document: NotebookDocument): string {
  const counts = document.cells.reduce(
    (current, cell) => ({
      ...current,
      [cell.type]: (current[cell.type] ?? 0) + 1
    }),
    {} as Record<string, number>
  );
  const parts = [
    `${document.cells.length} cells`,
    counts.matrix ? `${counts.matrix} matrix cells` : null,
    counts.sequence ? `${counts.sequence} sequence cells` : null,
    counts.equations ? `${counts.equations} equation cells` : null,
    counts.run ? `${counts.run} run cells` : null
  ].filter((part): part is string => Boolean(part));

  return `${document.title} (${parts.join(", ")}).`;
}

function normalizeDraftEquation(entry: unknown, index: number): EquationRow[] {
  if (!entry || typeof entry !== "object") {
    return [];
  }

  const candidate = entry as Partial<EquationRow>;
  if (typeof candidate.name !== "string" || typeof candidate.expression !== "string") {
    return [];
  }

  return [
    {
      id: typeof candidate.id === "string" && candidate.id.trim() !== "" ? candidate.id : `draft-eq-${index}-${candidate.name.trim()}`,
      name: candidate.name.trim(),
      expression: candidate.expression.trim(),
      ...(typeof candidate.desc === "string" && candidate.desc.trim() !== "" ? { desc: candidate.desc.trim() } : {}),
      ...(typeof candidate.role === "string" ? { role: candidate.role as EquationRow["role"] } : {})
    }
  ];
}

function normalizeDraftExternal(entry: unknown, index: number): ExternalRow[] {
  if (!entry || typeof entry !== "object") {
    return [];
  }

  const candidate = entry as Partial<ExternalRow>;
  if (typeof candidate.name !== "string" || typeof candidate.valueText !== "string") {
    return [];
  }

  const kind = candidate.kind === "series" ? "series" : "constant";

  return [
    {
      id: typeof candidate.id === "string" && candidate.id.trim() !== "" ? candidate.id : `draft-ext-${index}-${candidate.name.trim()}`,
      name: candidate.name.trim(),
      kind,
      valueText: candidate.valueText.trim(),
      ...(typeof candidate.desc === "string" && candidate.desc.trim() !== "" ? { desc: candidate.desc.trim() } : {})
    }
  ];
}

function normalizeDraftInitialValue(entry: unknown, index: number): InitialValueRow[] {
  if (!entry || typeof entry !== "object") {
    return [];
  }

  const candidate = entry as Partial<InitialValueRow>;
  if (typeof candidate.name !== "string" || typeof candidate.valueText !== "string") {
    return [];
  }

  return [
    {
      id: typeof candidate.id === "string" && candidate.id.trim() !== "" ? candidate.id : `draft-init-${index}-${candidate.name.trim()}`,
      name: candidate.name.trim(),
      valueText: candidate.valueText.trim()
    }
  ];
}

function normalizeDraftSolverOptions(entry: unknown): Partial<EditorOptions> | null {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const candidate = entry as Partial<EditorOptions>;
  const next: Partial<EditorOptions> = {};

  if (typeof candidate.periods === "number") {
    next.periods = candidate.periods;
  }
  if (typeof candidate.solverMethod === "string") {
    next.solverMethod = candidate.solverMethod as EditorOptions["solverMethod"];
  }
  if (typeof candidate.toleranceText === "string") {
    next.toleranceText = candidate.toleranceText;
  }
  if (typeof candidate.maxIterations === "number") {
    next.maxIterations = candidate.maxIterations;
  }
  if (typeof candidate.defaultInitialValueText === "string") {
    next.defaultInitialValueText = candidate.defaultInitialValueText;
  }
  if (typeof candidate.hiddenLeftVariable === "string") {
    next.hiddenLeftVariable = candidate.hiddenLeftVariable;
  }
  if (typeof candidate.hiddenRightVariable === "string") {
    next.hiddenRightVariable = candidate.hiddenRightVariable;
  }
  if (typeof candidate.hiddenToleranceText === "string") {
    next.hiddenToleranceText = candidate.hiddenToleranceText;
  }
  if (typeof candidate.relativeHiddenTolerance === "boolean") {
    next.relativeHiddenTolerance = candidate.relativeHiddenTolerance;
  }

  return Object.keys(next).length > 0 ? next : null;
}

function inferDraftSections(args: {
  equations: EquationRow[];
  externals: ExternalRow[];
  initialValues: InitialValueRow[];
  solverOptions: Partial<EditorOptions> | null;
}): string[] {
  const sections: string[] = [];

  if (args.equations.length > 0) {
    sections.push("Equations");
  }
  if (args.solverOptions) {
    sections.push("Solver options");
  }
  if (args.externals.length > 0) {
    sections.push("Externals");
  }
  if (args.initialValues.length > 0) {
    sections.push("Initial values");
  }

  return sections.length > 0 ? sections : CHAT_BUILDER_SECTION_NAMES;
}

function buildDraftEditorState(args: {
  equations: EquationRow[];
  externals: ExternalRow[];
  initialValues: InitialValueRow[];
  solverOptions: Partial<EditorOptions> | null;
}): EditorState | null {
  if (
    args.equations.length === 0 &&
    args.externals.length === 0 &&
    args.initialValues.length === 0 &&
    !args.solverOptions
  ) {
    return null;
  }

  return {
    equations: args.equations,
    externals: args.externals,
    initialValues: args.initialValues,
    options: {
      ...CHAT_BUILDER_DEFAULT_SOLVER_OPTIONS,
      ...(args.solverOptions ?? {})
    },
    scenario: { shocks: [] }
  };
}

function slugifyChatBuilderText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "chat-builder-draft";
}

function buildDraftNotebookDocument(args: {
  editor: EditorState;
  draftFocus: string;
  summary: string;
}): NotebookDocument {
  const notebookId = slugifyChatBuilderText(args.draftFocus || args.summary);
  const modelId = `${notebookId}-model`;
  const runCellId = `${notebookId}-baseline-run`;
  const chartVariables = args.editor.equations.slice(0, 3).map((equation) => equation.name);

  return {
    id: notebookId,
    title: `Chat Builder Draft: ${args.draftFocus || "SFC model"}`,
    metadata: { version: 1 },
    cells: [
      {
        id: `${notebookId}-overview`,
        type: "markdown",
        title: "Overview",
        source: args.summary
      },
      {
        id: `${notebookId}-equations`,
        type: "equations",
        title: "Equations",
        modelId,
        equations: args.editor.equations
      },
      {
        id: `${notebookId}-solver`,
        type: "solver",
        title: "Solver options",
        modelId,
        options: args.editor.options
      },
      {
        id: `${notebookId}-externals`,
        type: "externals",
        title: "Externals",
        modelId,
        externals: args.editor.externals
      },
      {
        id: `${notebookId}-initial-values`,
        type: "initial-values",
        title: "Initial values",
        modelId,
        initialValues: args.editor.initialValues
      },
      {
        id: runCellId,
        type: "run",
        title: "Baseline run",
        mode: "baseline",
        resultKey: `${notebookId}_baseline`,
        sourceModelId: modelId,
        description: args.summary
      },
      {
        id: `${notebookId}-baseline-chart`,
        type: "chart",
        title: "Baseline chart",
        sourceRunCellId: runCellId,
        variables: chartVariables
      }
    ]
  };
}

function ChatBuilderApp() {
  const [messages, setMessages] = useState<ChatMessage[]>(CHAT_BUILDER_INITIAL_MESSAGES);
  const [promptText, setPromptText] = useState(CHAT_BUILDER_SAMPLE_MESSAGES[1]?.text ?? "");
  const [draftStatus, setDraftStatus] = useState("Waiting for a prompt.");
  const [draftFocus, setDraftFocus] = useState("No draft has been created yet.");
  const [draftSummary, setDraftSummary] = useState(
    "The model preview will summarize the generated notebook sections here."
  );
  const [draftSections, setDraftSections] = useState<string[]>(CHAT_BUILDER_SECTION_NAMES);
  const [draftEquations, setDraftEquations] = useState<EquationRow[]>([]);
  const [draftExternals, setDraftExternals] = useState<ExternalRow[]>([]);
  const [draftInitialValues, setDraftInitialValues] = useState<InitialValueRow[]>([]);
  const [draftSolverOptions, setDraftSolverOptions] = useState<Partial<EditorOptions> | null>(null);
  const [draftNotebookDocument, setDraftNotebookDocument] = useState<NotebookDocument | null>(null);
  const [draftArtifactJson, setDraftArtifactJson] = useState<string | null>(null);
  const [draftActionMessage, setDraftActionMessage] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [isDrafting, setIsDrafting] = useState(false);
  const [betaPasswordInput, setBetaPasswordInput] = useState("");
  const [selectedModel, setSelectedModel] = useState(() => {
    if (typeof window === "undefined") {
      return CHAT_BUILDER_DEFAULT_MODEL;
    }

    return window.localStorage.getItem(CHAT_BUILDER_MODEL_STORAGE_KEY) ?? CHAT_BUILDER_DEFAULT_MODEL;
  });
  const [connectionMessage] = useState<string | null>(() =>
    CHAT_BUILDER_API_URL
      ? "Serverless endpoint configured. OpenAI requests will be proxied off-browser."
      : null
  );
  const chatMainDragScroll = useDragScroll<HTMLDivElement>();
  const chatSidebarDragScroll = useDragScroll<HTMLElement>();
  const chatPanelSplitter = usePanelSplitter({
    defaultLeftWidthPercent: 54,
    minLeftWidthPx: 520,
    minRightWidthPx: 320,
    storageKey: "sfcr:chat-builder-panel-split"
  });

  const hasChatBuilderEndpoint = CHAT_BUILDER_API_URL.length > 0;
  const canStartDraft = hasChatBuilderEndpoint && promptText.trim().length > 0 && !isDrafting;
  const draftEditorState = buildDraftEditorState({
    equations: draftEquations,
    externals: draftExternals,
    initialValues: draftInitialValues,
    solverOptions: draftSolverOptions
  });
  const draftValidationIssues = draftEditorState ? validateEditorState(draftEditorState) : [];
  const draftBuildDiagnostics = draftEditorState
    ? diagnoseBuildRuntime(draftEditorState)
    : { issues: [], modelError: null };
  const draftAllIssues = [...draftValidationIssues, ...draftBuildDiagnostics.issues];
  const draftBlockingIssues = draftAllIssues.filter(
    (issue) => (issue.severity ?? "error") === "error"
  );
  const canApplyDraft =
    draftEditorState != null &&
    draftBlockingIssues.length === 0 &&
    !draftBuildDiagnostics.modelError &&
    !isDrafting;
  const fallbackDraftNotebookDocument = draftEditorState
    ? buildDraftNotebookDocument({
        editor: draftEditorState,
        draftFocus,
        summary: draftSummary
      })
    : null;
  const activeDraftNotebookDocument = draftNotebookDocument ?? fallbackDraftNotebookDocument;
  const draftNotebookCellCounts = activeDraftNotebookDocument
    ? activeDraftNotebookDocument.cells.reduce(
        (current, cell) => ({
          ...current,
          [cell.type]: (current[cell.type] ?? 0) + 1
        }),
        {} as Record<string, number>
      )
    : {};

  function handleModelChange(nextModel: string): void {
    setSelectedModel(nextModel);
    window.localStorage.setItem(CHAT_BUILDER_MODEL_STORAGE_KEY, nextModel);
  }

  async function handleStartDraft(): Promise<void> {
    const trimmedPrompt = promptText.trim();
    if (!trimmedPrompt || !hasChatBuilderEndpoint) {
      return;
    }

    const userMessage: ChatMessage = {
      id: `user-${messages.length + 1}`,
      role: "user",
      text: trimmedPrompt
    };

    const nextMessages = [...messages, userMessage];

    setMessages(nextMessages);
    setDraftActionMessage(null);
    setDraftArtifactJson(null);
    setDraftError(null);
    setDraftNotebookDocument(null);
    setIsDrafting(true);
    setDraftStatus("Requesting draft from serverless endpoint...");
    setDraftFocus(trimmedPrompt);
    setPromptText("");

    try {
      const assistantMessageId = `assistant-${nextMessages.length + 1}`;
      let streamedAssistantText = "";
      const draftPlan = await requestChatBuilderDraft({
        betaPassword: betaPasswordInput,
        model: selectedModel,
        messages,
        prompt: trimmedPrompt,
        onTextDelta: (delta) => {
          streamedAssistantText += delta;
          setDraftStatus("Streaming draft from model...");
          setMessages((current) => {
            const existingMessage = current.find((message) => message.id === assistantMessageId);
            if (existingMessage) {
              return current.map((message) =>
                message.id === assistantMessageId
                  ? { ...message, text: streamedAssistantText || "Receiving draft..." }
                  : message
              );
            }

            return [
              ...current,
              {
                id: assistantMessageId,
                role: "assistant",
                text: streamedAssistantText || "Receiving draft..."
              }
            ];
          });
        }
      });

      setMessages((current) => {
        const hasStreamingMessage = current.some((message) => message.id === assistantMessageId);
        if (hasStreamingMessage) {
          return current.map((message) =>
            message.id === assistantMessageId ? { ...message, text: draftPlan.assistantText } : message
          );
        }

        return [
          ...current,
          {
            id: assistantMessageId,
            role: "assistant",
            text: draftPlan.assistantText
          }
        ];
      });
      setDraftEquations(draftPlan.equations);
      setDraftExternals(draftPlan.externals);
      setDraftInitialValues(draftPlan.initialValues);
      setDraftNotebookDocument(draftPlan.notebookDocument);
      setDraftSummary(draftPlan.summary);
      setDraftSections(draftPlan.sections);
      setDraftSolverOptions(draftPlan.solverOptions);
      setDraftStatus("Draft generated from model response.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to start draft.";
      setDraftError(message);
      setDraftStatus("Draft request failed.");
      setMessages((current) => [
        ...current,
        {
          id: `assistant-${current.length + 1}`,
          role: "assistant",
          text: `Draft request failed: ${message}`
        }
      ]);
    } finally {
      setIsDrafting(false);
    }
  }

  function handleApplyDraftNotebook(): void {
    if (!activeDraftNotebookDocument || !canApplyDraft) {
      return;
    }

    const nextJson = notebookToJson(activeDraftNotebookDocument);
    setDraftArtifactJson(nextJson);
    setDraftActionMessage("Applied validated draft to notebook JSON preview.");
  }

  function handleExportSections(): void {
    if (!canApplyDraft) {
      return;
    }

    const exported = JSON.stringify(
      {
        summary: draftSummary,
        sections: draftSections,
        equations: draftEquations,
        externals: draftExternals,
        initialValues: draftInitialValues,
        solverOptions: draftSolverOptions
      },
      null,
      2
    );

    navigator.clipboard
      .writeText(exported)
      .then(() => setDraftActionMessage("Copied validated draft sections to the clipboard."))
      .catch(() => setDraftActionMessage("Prepared validated draft sections, but clipboard access failed."));
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <div className="app-kicker">Experimental model generation</div>
          <h1>sfcr Chat Builder</h1>
          <p>
            Use a dedicated chat workspace to draft or revise stock-flow consistent notebook
            sections, then validate them before applying them to a notebook.
          </p>
        </div>

        <div className="app-header-stats" aria-label="Chat builder statistics">
          <div className="hero-stat">
            <span className="hero-stat-label">Mode</span>
            <strong>Experimental</strong>
          </div>
          <div className="hero-stat">
            <span className="hero-stat-label">Output</span>
            <strong>Sections</strong>
          </div>
          <div className="hero-stat">
            <span className="hero-stat-label">Status</span>
            <strong>Shell</strong>
          </div>
        </div>
      </header>

      <nav className="mode-switch" aria-label="Application modes">
        <a className="mode-switch-link" href="#/workspace">
          Workspace
        </a>
        <a className="mode-switch-link is-active" href="#/chat-builder">
          Chat builder
        </a>
        <a className="mode-switch-link" href="#/notebook">
          Notebook
        </a>
      </nav>

      <div ref={chatPanelSplitter.layoutRef} className="workspace-layout">
        <section
          ref={chatMainDragScroll.dragScrollRef}
          className={`workspace-main ${chatMainDragScroll.dragScrollProps.className}`}
          onClickCapture={chatMainDragScroll.dragScrollProps.onClickCapture}
          onMouseDown={chatMainDragScroll.dragScrollProps.onMouseDown}
          aria-label="Chat builder conversation"
        >
          <section className="control-panel chat-panel">
            <div className="panel-header">
              <div>
                <h2>Conversation</h2>
                <p className="panel-subtitle">
                  This pane will host streaming prompts, repair feedback, and revision requests.
                </p>
              </div>
            </div>

            <section className="meta-panel" aria-label="Chat builder connection settings">
              <label className="field" htmlFor="chat-builder-model-select">
                <span>Model</span>
                <select
                  id="chat-builder-model-select"
                  value={selectedModel}
                  onChange={(event) => handleModelChange(event.target.value)}
                >
                  <option value="gpt-5.5">GPT-5.5 (flagship model)</option>
                  <option value="gpt-4.1">GPT-4.1 (fast model)</option>
                  <option value="o3">o3 (strong model)</option>
                </select>
              </label>

              <label className="field" htmlFor="chat-builder-api-endpoint">
                <span>Serverless endpoint</span>
                <input
                  id="chat-builder-api-endpoint"
                  type="url"
                  value={CHAT_BUILDER_API_URL || "Not configured"}
                  readOnly
                />
              </label>

              <label className="field" htmlFor="chat-builder-beta-password">
                <span>Beta password</span>
                <input
                  id="chat-builder-beta-password"
                  type="password"
                  value={betaPasswordInput}
                  onChange={(event) => setBetaPasswordInput(event.target.value)}
                  placeholder="Required only when the API gate is enabled"
                />
              </label>

              <div className={connectionMessage ? "success-text" : "status-hint"}>
                {connectionMessage ??
                  "Set VITE_CHAT_BUILDER_API_URL before starting a draft. OpenAI keys stay in the Worker."}
              </div>
              {draftError ? <div className="field-error">{draftError}</div> : null}
            </section>

            <div className="chat-thread" role="log" aria-label="Chat transcript">
              {messages.map((message) => (
                <article
                  key={message.id}
                  className={`chat-message ${message.role === "assistant" ? "chat-message-assistant" : "chat-message-user"}`}
                >
                  <div className="chat-message-role">{message.role === "assistant" ? "Assistant" : "You"}</div>
                  {message.role === "assistant" ? (
                    <AssistantMarkdown text={message.text} />
                  ) : (
                    <p>{message.text}</p>
                  )}
                </article>
              ))}
            </div>

            <form className="chat-composer" aria-label="Chat builder composer">
              <label className="field" htmlFor="chat-builder-prompt">
                <span>Prompt</span>
                <textarea
                  id="chat-builder-prompt"
                  rows={5}
                  value={promptText}
                  onChange={(event) => setPromptText(event.target.value)}
                  placeholder="Describe the model or paste the current notebook sections to revise."
                />
              </label>

              <div className="button-row">
                <button type="button" disabled={isDrafting}>
                  Attach text file
                </button>
                <button type="button" disabled={!canStartDraft} onClick={() => void handleStartDraft()}>
                  {isDrafting ? "Starting..." : "Start draft"}
                </button>
              </div>
            </form>
          </section>
        </section>

        <div {...chatPanelSplitter.splitterProps} />

        <aside
          ref={chatSidebarDragScroll.dragScrollRef}
          className={`workspace-sidebar ${chatSidebarDragScroll.dragScrollProps.className}`}
          onClickCapture={chatSidebarDragScroll.dragScrollProps.onClickCapture}
          onMouseDown={chatSidebarDragScroll.dragScrollProps.onMouseDown}
        >
          <section className="status-panel chat-preview-panel">
            <div className="panel-header">
              <div>
                <h2>Draft Model Preview</h2>
                <p className="panel-subtitle">
                  Generated notebook sections stay here until validation passes and you apply them.
                </p>
              </div>
            </div>

            <div className="chat-preview-summary">
              <div>Status: {draftStatus}</div>
              <div>
                Validation: {draftEditorState == null ? "waiting for draft" : canApplyDraft ? "ready" : "issues found"}
              </div>
              <div>Apply flow: {canApplyDraft ? "ready when action is implemented" : "blocked by validation"}</div>
              <div>Connection: {hasChatBuilderEndpoint ? "serverless endpoint ready" : "endpoint required"}</div>
              <div>Draft focus: {draftFocus}</div>
            </div>

            {draftBuildDiagnostics.modelError ? (
              <div className="field-error">{draftBuildDiagnostics.modelError}</div>
            ) : null}

            {draftAllIssues.length > 0 ? (
              <section className="meta-panel chat-preview-block">
                <div>Draft validation issues</div>
                <ul className="chat-preview-detail-list">
                  {draftAllIssues.slice(0, 8).map((issue) => (
                    <li key={`${issue.path}-${issue.message}`}>
                      <span>{issue.message}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {draftActionMessage ? <div className="success-text">{draftActionMessage}</div> : null}

            <div className="meta-panel chat-preview-meta">
              <div>Assistant summary</div>
              <p>{draftSummary}</p>
            </div>

            <ol className="chat-preview-list">
              {draftSections.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ol>

            {activeDraftNotebookDocument ? (
              <section className="meta-panel chat-preview-block">
                <div>Notebook cells</div>
                <div className="chat-preview-option-grid">
                  <div>Total: {activeDraftNotebookDocument.cells.length}</div>
                  {draftNotebookCellCounts.matrix ? <div>Matrices: {draftNotebookCellCounts.matrix}</div> : null}
                  {draftNotebookCellCounts.sequence ? (
                    <div>Sequences: {draftNotebookCellCounts.sequence}</div>
                  ) : null}
                  {draftNotebookCellCounts.equations ? (
                    <div>Equation cells: {draftNotebookCellCounts.equations}</div>
                  ) : null}
                  {draftNotebookCellCounts.run ? <div>Runs: {draftNotebookCellCounts.run}</div> : null}
                </div>
              </section>
            ) : null}

            {draftEquations.length > 0 ? (
              <section className="meta-panel chat-preview-block">
                <div>Draft equations</div>
                <ul className="chat-preview-detail-list">
                  {draftEquations.map((equation) => (
                    <li key={equation.id}>
                      <strong>{equation.name}</strong>
                      <span className="chat-preview-code"> = {equation.expression}</span>
                      {equation.desc ? <div className="status-hint">{equation.desc}</div> : null}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {draftExternals.length > 0 ? (
              <section className="meta-panel chat-preview-block">
                <div>Draft externals</div>
                <ul className="chat-preview-detail-list">
                  {draftExternals.map((external) => (
                    <li key={external.id}>
                      <strong>{external.name}</strong>
                      <span>
                        {` (${external.kind}) `}
                        <span className="chat-preview-code">= {external.valueText}</span>
                      </span>
                      {external.desc ? <div className="status-hint">{external.desc}</div> : null}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {draftInitialValues.length > 0 ? (
              <section className="meta-panel chat-preview-block">
                <div>Draft initial values</div>
                <ul className="chat-preview-detail-list">
                  {draftInitialValues.map((initialValue) => (
                    <li key={initialValue.id}>
                      <strong>{initialValue.name}</strong>
                      <span className="chat-preview-code"> = {initialValue.valueText}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {draftSolverOptions ? (
              <section className="meta-panel chat-preview-block">
                <div>Draft solver options</div>
                <div className="chat-preview-option-grid">
                  {draftSolverOptions.periods != null ? <div>Periods: {draftSolverOptions.periods}</div> : null}
                  {draftSolverOptions.solverMethod ? (
                    <div>Method: {draftSolverOptions.solverMethod}</div>
                  ) : null}
                  {draftSolverOptions.toleranceText ? (
                    <div>Tolerance: {draftSolverOptions.toleranceText}</div>
                  ) : null}
                  {draftSolverOptions.maxIterations != null ? (
                    <div>Max iterations: {draftSolverOptions.maxIterations}</div>
                  ) : null}
                  {draftSolverOptions.defaultInitialValueText ? (
                    <div>Default initial value: {draftSolverOptions.defaultInitialValueText}</div>
                  ) : null}
                </div>
              </section>
            ) : null}

            <div className="meta-panel">
              <div>Current target: dedicated split-pane experiment</div>
              <div>Planned artifact: native SFCR model sections</div>
              <div>Notebook mutation: explicit only</div>
            </div>

            <div className="button-row">
              <button type="button" disabled={!canApplyDraft} onClick={handleApplyDraftNotebook}>
                Apply to draft notebook
              </button>
              <button type="button" disabled={!canApplyDraft} onClick={handleExportSections}>
                Export sections
              </button>
            </div>

            {draftArtifactJson ? (
              <section className="meta-panel chat-preview-block">
                <div>Draft notebook JSON</div>
                <textarea
                  className="chat-preview-textarea"
                  readOnly
                  value={draftArtifactJson}
                  aria-label="Draft notebook JSON"
                  rows={14}
                />
              </section>
            ) : null}
          </section>
        </aside>
      </div>
    </main>
  );
}

function withEditorDescriptions(
  editor: EditorState,
  equationDescriptions: Record<string, string>,
  externalDescriptions: Record<string, string>,
  equationUnits: Record<string, UnitMeta> = {},
  externalUnits: Record<string, UnitMeta> = {}
): EditorState {
  return {
    ...editor,
    equations: editor.equations.map((equation) => ({
      ...equation,
      desc: equationDescriptions[equation.name] ?? equation.desc ?? "",
      unitMeta: equationUnits[equation.name] ?? equation.unitMeta
    })),
    externals: editor.externals.map((external) => ({
      ...external,
      desc: externalDescriptions[external.name] ?? external.desc ?? "",
      unitMeta: externalUnits[external.name] ?? external.unitMeta
    }))
  };
}
