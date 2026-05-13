// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RunSourceEditor } from "../src/notebook/RunSourceEditor";
import type { NotebookCell } from "../src/notebook/types";

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
  }
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
});