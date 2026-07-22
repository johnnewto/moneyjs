// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MatrixGraphRailPanel } from "../src/notebook/components/MatrixGraphRailPanel";
import type { MatrixGraphChartEntry } from "../src/notebook/matrixGraphRailState";
import type { MatrixCell } from "../src/notebook/types";

afterEach(() => {
  cleanup();
});

const matrixCell: MatrixCell = {
  id: "balance-sheet",
  type: "matrix",
  title: "BMW balance sheet",
  sourceRunCellId: "baseline-run",
  columns: ["Firms", "Households", "Sum"],
  rows: [
    { label: "Loans", values: ["-Ld", "Cd", "0"] },
    { label: "Deposits", values: ["Ms", "-Mh", "0"] },
    { label: "Sum", values: ["0", "0", "0"], isSumRow: true }
  ]
};

function chartEntry(overrides: Partial<MatrixGraphChartEntry> = {}): MatrixGraphChartEntry {
  return {
    id: "chart-1",
    index: 0,
    kind: "row",
    label: "Loans",
    legendMode: "expression",
    matrixCellId: "balance-sheet",
    matrixTitle: "BMW balance sheet",
    pinned: false,
    series: [
      { crossLabel: "Firms", label: "-Ld", source: "-Ld", values: [1, 2, 3, 4] },
      { crossLabel: "Households", label: "Cd", source: "Cd", values: [4, 5, 6, 7] }
    ],
    sourceRunCellId: "baseline-run",
    variableDescriptions: new Map(),
    variableUnitMetadata: new Map(),
    ...overrides
  };
}

describe("MatrixGraphRailPanel", () => {
  it("shows a variable picker when the graph rail is empty", async () => {
    const user = userEvent.setup();
    const handleCreate = vi.fn();

    render(
      <MatrixGraphRailPanel
        cells={[matrixCell]}
        charts={[]}
        getResult={() => ({
          options: { periods: 4 },
          series: {
            Y: [100, 110, 120, 130],
            C: [80, 85, 90, 95]
          },
          warnings: []
        })}
        onAddChartSeries={vi.fn()}
        onCreateChartFromVariable={handleCreate}
        onDismissChart={vi.fn()}
        onRemoveChartSeries={vi.fn()}
        onToggleChartLegendMode={vi.fn()}
        onToggleChartPin={vi.fn()}
        selectedPeriodIndex={0}
      />
    );

    expect(screen.getByText(/Click a matrix row or column label/i)).toBeInTheDocument();
    expect(screen.getByText("Add a variable to graph")).toBeInTheDocument();
    const picker = screen.getByRole("listbox", { name: /available chart variables/i });
    await user.click(within(picker).getByRole("option", { name: /^Y$/i }));
    expect(handleCreate).toHaveBeenCalledWith("Y");
  });

  it("exposes add, hide, remove, and move actions for graph traces", async () => {
    const user = userEvent.setup();
    const handleAdd = vi.fn();
    const handleMove = vi.fn();
    const handleRemove = vi.fn();

    render(
      <MatrixGraphRailPanel
        cells={[matrixCell]}
        charts={[chartEntry()]}
        getResult={() => ({
          options: { periods: 4 },
          series: {
            Cd: [4, 5, 6, 7],
            Ld: [1, 2, 3, 4],
            Mh: [8, 9, 10, 11],
            Ms: [8, 9, 10, 11],
            Y: [100, 110, 120, 130]
          },
          warnings: []
        })}
        onAddChartSeries={handleAdd}
        onDismissChart={vi.fn()}
        onMoveChartSeries={handleMove}
        onRemoveChartSeries={handleRemove}
        onToggleChartLegendMode={vi.fn()}
        onToggleChartPin={vi.fn()}
        selectedPeriodIndex={0}
      />
    );

    const addButton = screen.getByRole("button", { name: /add chart variable/i });
    expect(addButton).toBeEnabled();
    expect(screen.getByRole("button", { name: /hide -Ld trace/i })).toBeInTheDocument();

    await user.click(addButton);
    const addMenu = screen.getByRole("listbox", { name: /available chart variables/i });
    await user.click(within(addMenu).getByRole("option", { name: /^Y$/i }));
    expect(handleAdd).toHaveBeenCalledWith("chart-1", "Y");

    await user.click(screen.getByRole("button", { name: /hide -Ld trace/i }));
    expect(screen.getByRole("button", { name: /show -Ld trace/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Cd chart variable actions$/i }));
    const removeMenu = screen.getByRole("menu", { name: /Cd chart variable actions/i });
    await user.click(within(removeMenu).getByRole("menuitem", { name: /remove from chart/i }));
    expect(handleRemove).toHaveBeenCalledWith("chart-1", "Cd");

    await user.click(screen.getByRole("button", { name: /^-Ld chart variable actions$/i }));
    const menu = screen.getByRole("menu", { name: /-Ld chart variable actions/i });
    await user.click(within(menu).getByRole("menuitem", { name: /move right/i }));
    expect(handleMove).toHaveBeenCalledWith("chart-1", "-Ld", "right");
  });

  it("adds a new empty graph panel from the plus button", async () => {
    const user = userEvent.setup();
    const handleCreateEmpty = vi.fn();

    render(
      <MatrixGraphRailPanel
        cells={[matrixCell]}
        charts={[chartEntry()]}
        getResult={() => ({
          options: { periods: 4 },
          series: {
            Cd: [4, 5, 6, 7],
            Ld: [1, 2, 3, 4],
            Y: [100, 110, 120, 130]
          },
          warnings: []
        })}
        onAddChartSeries={vi.fn()}
        onCreateEmptyChart={handleCreateEmpty}
        onDismissChart={vi.fn()}
        onRemoveChartSeries={vi.fn()}
        onToggleChartLegendMode={vi.fn()}
        onToggleChartPin={vi.fn()}
        selectedPeriodIndex={0}
      />
    );

    await user.click(screen.getByRole("button", { name: /add graph panel/i }));
    expect(handleCreateEmpty).toHaveBeenCalledTimes(1);
  });

  it("places the panel pin button next to the add-graph plus button", async () => {
    const user = userEvent.setup();
    const handleTogglePanelPin = vi.fn();

    render(
      <MatrixGraphRailPanel
        cells={[matrixCell]}
        charts={[chartEntry()]}
        getResult={() => ({
          options: { periods: 4 },
          series: {
            Cd: [4, 5, 6, 7],
            Ld: [1, 2, 3, 4],
            Y: [100, 110, 120, 130]
          },
          warnings: []
        })}
        onAddChartSeries={vi.fn()}
        onCreateEmptyChart={vi.fn()}
        onDismissChart={vi.fn()}
        onRemoveChartSeries={vi.fn()}
        onToggleChartLegendMode={vi.fn()}
        onToggleChartPin={vi.fn()}
        onTogglePanelPin={handleTogglePanelPin}
        selectedPeriodIndex={0}
      />
    );

    const footer = document.querySelector(".notebook-graph-rail-add-chart");
    expect(footer).not.toBeNull();
    if (!(footer instanceof HTMLElement)) {
      throw new Error("Expected graph footer actions.");
    }

    const pinButton = within(footer).getByRole("button", { name: /pin in floating panel/i });
    const addButton = within(footer).getByRole("button", { name: /add graph panel/i });
    expect(footer.children[0]).toBe(pinButton);
    expect(footer.children[1]).toBe(addButton);

    await user.click(pinButton);
    expect(handleTogglePanelPin).toHaveBeenCalledTimes(1);
  });

  it("hides the plus button when the last chart is already an empty picker", () => {
    render(
      <MatrixGraphRailPanel
        cells={[matrixCell]}
        charts={[
          chartEntry(),
          chartEntry({
            id: "chart-empty",
            matrixCellId: "",
            series: []
          })
        ]}
        getResult={() => ({
          options: { periods: 4 },
          series: {
            Cd: [4, 5, 6, 7],
            Ld: [1, 2, 3, 4],
            Y: [100, 110, 120, 130]
          },
          warnings: []
        })}
        onAddChartSeries={vi.fn()}
        onCreateEmptyChart={vi.fn()}
        onDismissChart={vi.fn()}
        onRemoveChartSeries={vi.fn()}
        onToggleChartLegendMode={vi.fn()}
        onToggleChartPin={vi.fn()}
        selectedPeriodIndex={0}
      />
    );

    expect(screen.getByText("Add a variable to graph")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add graph panel/i })).not.toBeInTheDocument();
  });
});
