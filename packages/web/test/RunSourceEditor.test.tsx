// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RunSourceEditor } from "../src/notebook/RunSourceEditor";
import type { NotebookCell } from "../src/notebook/types";

function ControlledRunSourceEditor({ initialValue }: { initialValue: string }) {
  const [value, setValue] = useState(initialValue);
  return <RunSourceEditor value={value} onChange={setValue} />;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const scenarioRunSource = JSON.stringify({
  id: "scenario-run",
  type: "run",
  title: "Scenario run",
  mode: "scenario",
  baselineRunCellId: "baseline-run",
  baselineStartPeriod: 50,
  periods: 20,
  resultKey: "scenario_result",
  sourceModelId: "main",
  scenario: {
    shocks: [
      {
        rangeInclusive: [5, 20],
        variables: {
          Gd: { kind: "constant", value: 30 }
        }
      }
    ]
  }
});

const notebookCells: NotebookCell[] = [
  {
    id: "baseline-run",
    type: "run",
    title: "Baseline run",
    mode: "baseline",
    periods: 50,
    resultKey: "baseline_result",
    sourceModelId: "main"
  },
  JSON.parse(scenarioRunSource) as NotebookCell
];

describe("RunSourceEditor", () => {
  it("keeps scenario data when baseline mode switch is cancelled", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const onChange = vi.fn();

    render(<RunSourceEditor value={scenarioRunSource} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText(/run mode/i), { target: { value: "baseline" } });

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("remove its scenario shocks"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("removes scenario-only data when baseline mode switch is confirmed", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const onChange = vi.fn();

    render(<RunSourceEditor value={scenarioRunSource} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText(/run mode/i), { target: { value: "baseline" } });

    const nextSource = onChange.mock.calls[0]?.[0];
    expect(nextSource).toEqual(expect.any(String));
    const nextCell = JSON.parse(nextSource);
    expect(nextCell.mode).toBe("baseline");
    expect(nextCell.scenario).toBeUndefined();
    expect(nextCell.baselineRunCellId).toBeUndefined();
    expect(nextCell.baselineStartPeriod).toBeUndefined();
    expect(nextCell.periods).toBe(20);
  });

  it("clamps start period to the referenced baseline period count", () => {
    const onChange = vi.fn();

    render(<RunSourceEditor cells={notebookCells} value={scenarioRunSource} onChange={onChange} />);

    expect(screen.getByText(/start period \(<=50\)/i)).toBeInTheDocument();

    const startPeriodInput = within(screen.getByLabelText(/run settings/i)).getByLabelText(
      /start period \(<=50\)/i
    );
    expect(startPeriodInput).toHaveAttribute("max", "50");

    fireEvent.change(startPeriodInput, { target: { value: "75" } });

    const nextSource = onChange.mock.calls[0]?.[0];
    expect(nextSource).toEqual(expect.any(String));
    expect(JSON.parse(nextSource).baselineStartPeriod).toBe(50);
  });

  const windowedRunSource = JSON.stringify({
    id: "windowed-run",
    type: "run",
    title: "Windowed run",
    mode: "baseline",
    periods: 32,
    resultKey: "windowed_result",
    sourceModelId: "main",
    exogenize: [
      { name: "Lpc", throughPeriod: 25 },
      { name: "rstar", throughPeriod: 25 },
      "oph",
      "opf"
    ]
  });

  it("renders windowed exogenize entries as a scrolling table without [object Object]", () => {
    const { container } = render(<RunSourceEditor value={windowedRunSource} onChange={vi.fn()} />);

    expect((screen.getByLabelText("Exogenize variable 1") as HTMLInputElement).value).toBe("Lpc");
    expect((screen.getByLabelText("Exogenize variable 3") as HTMLInputElement).value).toBe("oph");
    expect((screen.getByLabelText(/throughPeriod for Lpc/i) as HTMLInputElement).value).toBe("25");
    expect((screen.getByLabelText(/throughPeriod for oph/i) as HTMLInputElement).value).toBe("");
    expect(container.textContent).not.toContain("[object Object]");
  });

  it("preserves a throughPeriod window when a variable name cell is edited", () => {
    const onChange = vi.fn();

    render(<RunSourceEditor value={windowedRunSource} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Exogenize variable 1"), {
      target: { value: "LpcRenamed" }
    });

    const nextCell = JSON.parse(onChange.mock.calls[0]?.[0]);
    expect(nextCell.exogenize[0]).toEqual({ name: "LpcRenamed", throughPeriod: 25 });
  });

  it("rezips a throughPeriod cell edit into a windowed exogenize entry", () => {
    const onChange = vi.fn();

    render(<RunSourceEditor value={windowedRunSource} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText(/throughPeriod for oph/i), {
      target: { value: "30" }
    });

    const nextCell = JSON.parse(onChange.mock.calls[0]?.[0]);
    expect(nextCell.exogenize).toEqual([
      { name: "Lpc", throughPeriod: 25 },
      { name: "rstar", throughPeriod: 25 },
      { name: "oph", throughPeriod: 30 },
      "opf"
    ]);
  });

  it("clears a throughPeriod cell back to a whole-run (bare) entry", () => {
    const onChange = vi.fn();

    render(<RunSourceEditor value={windowedRunSource} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText(/throughPeriod for rstar/i), {
      target: { value: "" }
    });

    const nextCell = JSON.parse(onChange.mock.calls[0]?.[0]);
    expect(nextCell.exogenize[1]).toBe("rstar");
  });

  it("appends comma-separated variables from the add cell", () => {
    const onChange = vi.fn();
    const runSource = JSON.stringify({
      id: "run",
      type: "run",
      title: "Run",
      mode: "baseline",
      periods: 10,
      resultKey: "result",
      sourceModelId: "main",
      exogenize: ["Lpc"]
    });

    render(<RunSourceEditor value={runSource} onChange={onChange} />);

    const addInput = screen.getByLabelText("Add exogenize variable");
    fireEvent.change(addInput, { target: { value: "rstar, oph" } });
    fireEvent.blur(addInput);

    const nextCell = JSON.parse(onChange.mock.calls[0]?.[0]);
    expect(nextCell.exogenize).toEqual(["Lpc", "rstar", "oph"]);
  });

  it("keeps the table after removing the last item (controlled round-trip)", () => {
    const runSource = JSON.stringify({
      id: "run",
      type: "run",
      title: "Run",
      mode: "baseline",
      periods: 10,
      resultKey: "result",
      sourceModelId: "main",
      exogenize: ["Lpc", "rstar", "oph"]
    });

    render(<ControlledRunSourceEditor initialValue={runSource} />);

    fireEvent.click(screen.getByLabelText("Remove oph"));

    expect((screen.getByLabelText("Exogenize variable 1") as HTMLInputElement).value).toBe("Lpc");
    expect((screen.getByLabelText("Exogenize variable 2") as HTMLInputElement).value).toBe("rstar");
    expect(screen.queryByLabelText("Exogenize variable 3")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Add exogenize variable")).toBeInTheDocument();
  });

  it("keeps the table after adding an item (controlled round-trip)", () => {
    const runSource = JSON.stringify({
      id: "run",
      type: "run",
      title: "Run",
      mode: "baseline",
      periods: 10,
      resultKey: "result",
      sourceModelId: "main",
      exogenize: ["Lpc"]
    });

    render(<ControlledRunSourceEditor initialValue={runSource} />);

    const addInput = screen.getByLabelText("Add exogenize variable");
    fireEvent.change(addInput, { target: { value: "rstar" } });
    fireEvent.keyDown(addInput, { key: "Enter" });

    expect((screen.getByLabelText("Exogenize variable 1") as HTMLInputElement).value).toBe("Lpc");
    expect((screen.getByLabelText("Exogenize variable 2") as HTMLInputElement).value).toBe("rstar");
    expect(screen.getByLabelText("Add exogenize variable")).toBeInTheDocument();
  });

  it("keeps every column after editing a window cell (controlled round-trip)", () => {
    render(<ControlledRunSourceEditor initialValue={windowedRunSource} />);

    expect(screen.getByLabelText("Exogenize variable 4")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/throughPeriod for oph/i), {
      target: { value: "30" }
    });

    expect((screen.getByLabelText("Exogenize variable 1") as HTMLInputElement).value).toBe("Lpc");
    expect((screen.getByLabelText("Exogenize variable 4") as HTMLInputElement).value).toBe("opf");
    expect((screen.getByLabelText(/throughPeriod for oph/i) as HTMLInputElement).value).toBe("30");
  });

  it("removes a variable column", () => {
    const onChange = vi.fn();

    render(<RunSourceEditor value={windowedRunSource} onChange={onChange} />);

    fireEvent.click(screen.getByLabelText("Remove oph"));

    const nextCell = JSON.parse(onChange.mock.calls[0]?.[0]);
    expect(nextCell.exogenize).toEqual([
      { name: "Lpc", throughPeriod: 25 },
      { name: "rstar", throughPeriod: 25 },
      "opf"
    ]);
  });

  it("offers notebook-wide rename when a scenario shock variable is renamed", () => {
    const onChange = vi.fn();
    const onReplaceCells = vi.fn();

    render(
      <RunSourceEditor
        cells={notebookCells}
        runCellId="scenario-run"
        value={scenarioRunSource}
        onChange={onChange}
        onReplaceCells={onReplaceCells}
      />
    );

    const nameInput = screen.getByLabelText(/shock variable Gd/i);
    fireEvent.change(nameInput, { target: { value: "G_d" } });
    expect(
      screen.queryByRole("dialog", { name: /rename variable across notebook/i })
    ).not.toBeInTheDocument();

    fireEvent.blur(nameInput);

    expect(screen.getByRole("dialog", { name: /rename variable across notebook/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Yes" }));

    expect(onReplaceCells).toHaveBeenCalledTimes(1);
    const nextCells = onReplaceCells.mock.calls[0]?.[0] as NotebookCell[];
    const scenarioRun = nextCells.find(
      (cell): cell is Extract<NotebookCell, { type: "run" }> =>
        cell.type === "run" && cell.id === "scenario-run"
    );
    expect(scenarioRun?.scenario?.shocks[0]?.variables).toHaveProperty("G_d");
    expect(scenarioRun?.scenario?.shocks[0]?.variables).not.toHaveProperty("Gd");
  });
});