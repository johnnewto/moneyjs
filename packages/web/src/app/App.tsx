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
import { ScenarioEditor } from "../components/ScenarioEditor";
import { SolverPanel } from "../components/SolverPanel";
import { ValidationSummary } from "../components/ValidationSummary";
import { useSolver } from "../hooks/useSolver";
import { NotebookApp } from "../notebook/NotebookApp";
import { useAppRoute } from "./routes";
import {
  buildRuntimeConfig,
  diagnoseBuildRuntime,
  editorStateFromJson,
  editorStateFromModel,
  runtimeDocumentToJson,
  validateEditorState,
  type EditorState,
  type RuntimeDocument
} from "../lib/editorModel";
import { buildVariableDescriptions, getVariableDescription } from "../lib/variableDescriptions";

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
  YD: "Disposable income of households"
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
      BMW_EXTERNAL_DESCRIPTIONS
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
  const solver = useSolver();
  const validationIssues = validateEditorState(editor);
  const buildDiagnostics = diagnoseBuildRuntime(editor);
  const allIssues = [...validationIssues, ...buildDiagnostics.issues];
  const issueMap = Object.fromEntries(allIssues.map((issue) => [issue.path, issue.message]));
  const variableDescriptions = buildVariableDescriptions({
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

  const canRunScenario = runtime?.scenario != null && allIssues.length === 0 && !buildDiagnostics.modelError;
  const canRunBaseline = runtime != null && allIssues.length === 0 && !buildDiagnostics.modelError;

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
        <a className="mode-switch-link" href="#/notebook">
          Notebook
        </a>
      </nav>

      <div className="workspace-layout">
        <div className="workspace-main">
          <EquationGridEditor
            buildError={buildDiagnostics.modelError}
            currentValues={currentValueMap}
            equations={editor.equations}
            issues={issueMap}
            onChange={(equations) => setEditor((current) => ({ ...current, equations }))}
            parameterNames={editor.externals.map((external) => external.name)}
            variableDescriptions={variableDescriptions}
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
              />
              <ResultTable
                title="All Series"
                rows={resultRows}
                selectedIndex={selectedPeriodIndex}
                variableDescriptions={variableDescriptions}
              />
            </>
          ) : null}
        </div>

        <aside className="workspace-sidebar">
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
            />
          ) : null}
        </aside>
      </div>
    </main>
  );
}

function withEditorDescriptions(
  editor: EditorState,
  equationDescriptions: Record<string, string>,
  externalDescriptions: Record<string, string>
): EditorState {
  return {
    ...editor,
    equations: editor.equations.map((equation) => ({
      ...equation,
      desc: equationDescriptions[equation.name] ?? equation.desc ?? ""
    })),
    externals: editor.externals.map((external) => ({
      ...external,
      desc: externalDescriptions[external.name] ?? external.desc ?? ""
    }))
  };
}
