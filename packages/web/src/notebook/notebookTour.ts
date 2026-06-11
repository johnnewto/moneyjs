import { driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";

export type NotebookTourRailTab =
  | "editor"
  | "variables"
  | "inspect"
  | "graph"
  | "contents"
  | "assistant"
  | "help"
  | "preview";

export const NOTEBOOK_TOUR_SEEN_STORAGE_KEY = "sfcr:notebook-tour-seen";

export type NotebookTourHandlers = {
  openRailTab: (tab: NotebookTourRailTab) => void;
  openHelpPanel?(): void;
};

export type NotebookTourStepOption = {
  id: string;
  title: string;
};

type NotebookTourStepDefinition = NotebookTourStepOption & {
  buildStep(handlers: NotebookTourHandlers): DriveStep;
};

function queryTourElement(selector: string): Element | undefined {
  return document.querySelector(selector) ?? undefined;
}

function queryFirstNotebookCell(cellType: string): Element | undefined {
  return queryTourElement(`#NotebookCanvas .notebook-cell-${cellType}`);
}

function queryFirstEquationsCell(): Element | undefined {
  return queryFirstNotebookCell("equations") ?? queryFirstNotebookCell("model");
}

function queryCellEditButton(cell: Element | undefined): Element | undefined {
  if (!cell) {
    return undefined;
  }

  for (const button of cell.querySelectorAll("button")) {
    if (button.textContent?.trim() === "Edit") {
      return button;
    }
  }

  return undefined;
}

function queryFirstCellEditButton(cellType: string): Element | undefined {
  return queryCellEditButton(queryFirstNotebookCell(cellType));
}

function queryFirstEquationsEditButton(): Element | undefined {
  return (
    queryFirstCellEditButton("equations") ??
    queryCellEditButton(queryFirstNotebookCell("model"))
  );
}

function queryFirstMatrixGraphLabel(): Element | undefined {
  return queryTourElement(
    "#NotebookCanvas .notebook-cell-matrix .notebook-matrix-slice-label-button"
  );
}

function scrollTourTargetIntoView(element: Element | undefined) {
  element?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
}

function openHelpPanel(handlers: NotebookTourHandlers) {
  if (handlers.openHelpPanel) {
    handlers.openHelpPanel();
    return;
  }
  handlers.openRailTab("help");
}

const NOTEBOOK_TOUR_STEP_DEFINITIONS: NotebookTourStepDefinition[] = [
  {
    id: "command-bar",
    title: "Command bar",
    buildStep: () => ({
      element: "#notebook-command-tray",
      popover: {
        title: "Command bar",
        description:
          "Use the command bar to undo and redo edits, run the notebook, validate structure, export, and jump to the contents outline."
      }
    })
  },
  {
    id: "run-all",
    title: "Run all",
    buildStep: () => ({
      element: "#notebook-run-all",
      popover: {
        title: "Run all",
        description:
          "Run every runnable cell in the notebook. Run results populate matrices, charts, and the variable catalog."
      }
    })
  },
  {
    id: "notebook-canvas",
    title: "Notebook canvas",
    buildStep: () => ({
      element: "#NotebookCanvas",
      popover: {
        title: "Notebook canvas",
        description:
          "Cells live here: markdown, equations, matrices, runs, charts, and tables. Select a cell to work with it, then apply edits in place."
      }
    })
  },
  {
    id: "markdown-overview",
    title: "Overview markdown",
    buildStep: () => ({
      element: () => queryFirstNotebookCell("markdown"),
      onHighlightStarted: () => {
        scrollTourTargetIntoView(queryFirstNotebookCell("markdown"));
      },
      popover: {
        title: "Overview markdown",
        description:
          "The opening markdown cell explains the model, assumptions, and workflow. Press Edit to change the narrative, or click variable names after a run to inspect them."
      }
    })
  },
  {
    id: "contents-tab",
    title: "Contents",
    buildStep: (handlers) => ({
      element: "#notebook-rail-tab-contents",
      onHighlightStarted: () => {
        handlers.openRailTab("contents");
      },
      popover: {
        title: "Contents",
        description:
          "The Contents tab lists every cell in reading order. Click an entry to select that cell and scroll the canvas to it."
      }
    })
  },
  {
    id: "contents-outline",
    title: "Contents outline",
    buildStep: (handlers) => ({
      element: "#notebook-outline-panel",
      onHighlightStarted: () => {
        handlers.openRailTab("contents");
      },
      popover: {
        title: "Contents outline",
        description:
          "Use this outline to navigate long notebooks. The selected row matches the highlighted cell on the canvas."
      }
    })
  },
  {
    id: "matrix-cells",
    title: "Matrix cells",
    buildStep: () => ({
      element: () => queryFirstNotebookCell("matrix"),
      onHighlightStarted: () => {
        scrollTourTargetIntoView(queryFirstNotebookCell("matrix"));
      },
      popover: {
        title: "Matrix cells",
        description:
          "Matrix cells show balance sheets and transaction-flow tables. After a run, signed entries resolve to simulated values for the selected period."
      }
    })
  },
  {
    id: "edit-matrix",
    title: "Edit a matrix",
    buildStep: () => ({
      element: () => queryFirstCellEditButton("matrix"),
      onHighlightStarted: () => {
        scrollTourTargetIntoView(queryFirstCellEditButton("matrix"));
      },
      popover: {
        title: "Edit a matrix",
        description:
          "Press Edit to open the matrix source editor. Use grid mode for structured edits or JSON mode for bulk changes, then Apply to save."
      }
    })
  },
  {
    id: "matrix-graph-label",
    title: "Graph a matrix row or column",
    buildStep: () => ({
      element: () => queryFirstMatrixGraphLabel(),
      onHighlightStarted: () => {
        scrollTourTargetIntoView(queryFirstMatrixGraphLabel());
      },
      popover: {
        title: "Graph a matrix row or column",
        description:
          "After running, click a row or column label in a matrix to graph its signed entries over time. Ctrl+click a label to inspect a variable instead."
      }
    })
  },
  {
    id: "graph-tab",
    title: "Graph panel",
    buildStep: (handlers) => ({
      element: "#notebook-rail-tab-graph",
      onHighlightStarted: () => {
        handlers.openRailTab("graph");
      },
      popover: {
        title: "Graph panel",
        description:
          "The Graph tab opens when you graph a matrix slice. Pin a chart to keep it while exploring other rows or columns."
      }
    })
  },
  {
    id: "graph-charts",
    title: "Matrix graph charts",
    buildStep: (handlers) => ({
      element: "#notebook-graph-panel",
      onHighlightStarted: () => {
        handlers.openRailTab("graph");
      },
      popover: {
        title: "Matrix graph charts",
        description:
          "Charts built from matrix slices appear here. Add series, switch legend labels, and compare signed flows across periods."
      }
    })
  },
  {
    id: "equation-cells",
    title: "Equation cells",
    buildStep: () => ({
      element: () => queryFirstEquationsCell(),
      onHighlightStarted: () => {
        scrollTourTargetIntoView(queryFirstEquationsCell());
      },
      popover: {
        title: "Equation cells",
        description:
          "Equation cells define the endogenous model. They work together with externals, initial values, and solver settings in the same model section."
      }
    })
  },
  {
    id: "edit-equations",
    title: "Edit equations",
    buildStep: () => ({
      element: () => queryFirstEquationsEditButton(),
      onHighlightStarted: () => {
        scrollTourTargetIntoView(queryFirstEquationsEditButton());
      },
      popover: {
        title: "Edit equations",
        description:
          "Press Edit to change equations in grid mode or JSON mode. Apply saves the cell; Cancel discards the draft."
      }
    })
  },
  {
    id: "variables-tab",
    title: "Variables",
    buildStep: (handlers) => ({
      element: "#notebook-rail-tab-variables",
      onHighlightStarted: () => {
        handlers.openRailTab("variables");
      },
      popover: {
        title: "Variables",
        description:
          "Browse every model variable in one catalog. Filter, sort, group, and switch between table and parameter views."
      }
    })
  },
  {
    id: "variable-catalog",
    title: "Variable catalog",
    buildStep: (handlers) => ({
      element: "#notebook-variables-panel",
      onHighlightStarted: () => {
        handlers.openRailTab("variables");
      },
      popover: {
        title: "Variable catalog",
        description:
          "The catalog shows names, descriptions, current values, units, and roles. Click a row to inspect that variable."
      }
    })
  },
  {
    id: "browse-variables",
    title: "Browse variables",
    buildStep: (handlers) => ({
      element: "#notebook-variable-catalog-table",
      onHighlightStarted: () => {
        handlers.openRailTab("variables");
      },
      popover: {
        title: "Browse variables",
        description:
          "Use the search box and group-by menu to narrow the list. Selecting a row opens the variable in the Inspect panel."
      }
    })
  },
  {
    id: "inspect-tab",
    title: "Inspect",
    buildStep: (handlers) => ({
      element: "#notebook-rail-tab-inspect",
      onHighlightStarted: () => {
        handlers.openRailTab("inspect");
      },
      popover: {
        title: "Inspect",
        description:
          "Inspect shows the selected variable: value, defining equation, related parameters, and a sparkline when run data is available."
      }
    })
  },
  {
    id: "inspect-panel",
    title: "Inspect panel",
    buildStep: (handlers) => ({
      element: "#notebook-inspect-panel",
      onHighlightStarted: () => {
        handlers.openRailTab("inspect");
      },
      popover: {
        title: "Inspect panel",
        description:
          "Click a variable in the catalog, a chart series, or Ctrl+click a matrix label to inspect it here. Use back and forward to revisit recent variables."
      }
    })
  },
  {
    id: "template-picker",
    title: "Notebook template",
    buildStep: () => ({
      element: "#notebook-template-picker",
      popover: {
        title: "Notebook template",
        description: "Switch between built-in templates, saved variants, and imported notebooks."
      }
    })
  },
  {
    id: "help-topics",
    title: "Help tab",
    buildStep: (handlers) => ({
      element: "#notebook-rail-tab-help",
      onHighlightStarted: () => {
        handlers.openRailTab("help");
      },
      popover: {
        title: "Help tab",
        description:
          "Open the Help tab for detailed guidance on each cell type and notebook workflow."
      }
    })
  },
  {
    id: "help-panel",
    title: "Help panel",
    buildStep: (handlers) => ({
      element: "#notebook-help-panel",
      onHighlightStarted: () => {
        openHelpPanel(handlers);
      },
      popover: {
        title: "Help panel",
        description:
          "Read help topics here, use More Help to browse the full topic list, or open a cell Help button for context-specific guidance."
      }
    })
  }
];

export const NOTEBOOK_TOUR_STEPS: NotebookTourStepOption[] = NOTEBOOK_TOUR_STEP_DEFINITIONS.map(
  ({ id, title }) => ({ id, title })
);

export function hasSeenNotebookTour(): boolean {
  return window.localStorage.getItem(NOTEBOOK_TOUR_SEEN_STORAGE_KEY) === "1";
}

export function markNotebookTourSeen(): void {
  window.localStorage.setItem(NOTEBOOK_TOUR_SEEN_STORAGE_KEY, "1");
}

function buildNotebookTourSteps(handlers: NotebookTourHandlers): DriveStep[] {
  return NOTEBOOK_TOUR_STEP_DEFINITIONS.map((definition) => definition.buildStep(handlers));
}

export function createNotebookTour(handlers: NotebookTourHandlers) {
  return driver({
    showProgress: true,
    onDestroyed: () => {
      markNotebookTourSeen();
    },
    steps: buildNotebookTourSteps(handlers)
  });
}

export function startNotebookTour(handlers: NotebookTourHandlers, startIndex = 0) {
  const boundedStartIndex = Math.min(
    Math.max(startIndex, 0),
    NOTEBOOK_TOUR_STEPS.length - 1
  );
  const tour = createNotebookTour(handlers);
  tour.drive(boundedStartIndex);
}

export function maybeStartNotebookTourOnFirstLoad(handlers: NotebookTourHandlers): () => void {
  if (hasSeenNotebookTour()) {
    return () => {};
  }

  let timeoutId: number | null = null;
  const animationFrameId = window.requestAnimationFrame(() => {
    timeoutId = window.setTimeout(() => {
      if (hasSeenNotebookTour()) {
        return;
      }
      startNotebookTour(handlers, 0);
    }, 400);
  });

  return () => {
    window.cancelAnimationFrame(animationFrameId);
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
    }
  };
}
