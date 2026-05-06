// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent as testingFireEvent, screen as testingScreen } from "@testing-library/react";
import userEventLib from "@testing-library/user-event";
import { EditorView } from "@codemirror/view";
import { runBaseline as runCoreBaseline } from "@sfcr/core";
import { afterEach, beforeAll, beforeEach, vi } from "vitest";

import { bmwBaselineModel, bmwBaselineOptions } from "../../core/src/fixtures/bmw";
import { App as AppComponent } from "../src/app/App";

export const fireEvent = testingFireEvent;
export const screen = testingScreen;
export const userEvent = userEventLib;
export const App = AppComponent;

export const runBaseline = vi.fn();
export const runScenario = vi.fn();
export const validate = vi.fn();
export const bmwNotebookBaselineResult = runCoreBaseline(bmwBaselineModel, bmwBaselineOptions);

export let notebookRunnerMock: {
  outputs: Record<string, { type: "result"; result: typeof bmwNotebookBaselineResult }>;
  status: Record<string, "idle" | "running" | "success" | "error">;
  errors: Record<string, string | undefined>;
  runCell: ReturnType<typeof vi.fn>;
  runAll: ReturnType<typeof vi.fn>;
  getResult: (cellId: string) => typeof bmwNotebookBaselineResult | null;
};

vi.mock("../src/hooks/useSolver", () => ({
  useSolver: () => ({
    status: "idle" as const,
    result: null,
    error: null,
    progress: null,
    runBaseline,
    runScenario,
    validate
  })
}));

vi.mock("../src/notebook/useNotebookRunner", () => ({
  useNotebookRunner: () => notebookRunnerMock
}));

export function setupAppTestEnv(): void {
  beforeAll(() => {
    if (typeof Range !== "undefined") {
      const emptyClientRects = {
        length: 0,
        item: () => null,
        [Symbol.iterator]: function* emptyClientRectIterator() {
          return;
        }
      } as DOMRectList;

      Range.prototype.getClientRects ??= () => emptyClientRects;
      Range.prototype.getBoundingClientRect ??= () => new DOMRect();
    }
  });

  beforeEach(() => {
    window.location.hash = "#/workspace";
    window.localStorage.clear();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined)
      }
    });
    runBaseline.mockReset();
    runScenario.mockReset();
    validate.mockReset();
    notebookRunnerMock = {
      outputs: {},
      status: {},
      errors: {},
      runCell: vi.fn().mockResolvedValue(undefined),
      runAll: vi.fn().mockResolvedValue(undefined),
      getResult: () => null
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });
}

export function setSuccessfulNotebookRunner(
  cellId = "baseline-newton",
  result = bmwNotebookBaselineResult
): void {
  notebookRunnerMock = {
    outputs: {
      [cellId]: { type: "result", result }
    },
    status: { [cellId]: "success" },
    errors: {},
    runCell: vi.fn().mockResolvedValue(undefined),
    runAll: vi.fn().mockResolvedValue(undefined),
    getResult: (requestedCellId: string) => (requestedCellId === cellId ? result : null)
  };
}

export function getNotebookSourceTextArea(): HTMLTextAreaElement {
  return screen.getByTestId("notebook-source-text") as HTMLTextAreaElement;
}

export function getNotebookSourceEditor(): HTMLElement {
  return screen.getByRole("textbox", { name: /notebook source editor/i });
}

export function setNotebookSourceValue(value: string): void {
  const editor = screen.queryByRole("textbox", { name: /notebook source editor/i });
  const view = editor ? EditorView.findFromDOM(editor) : null;

  if (view) {
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value }
    });
    return;
  }

  fireEvent.change(getNotebookSourceTextArea(), {
    target: { value }
  });
}

export function getFormulaTokensByText(container: HTMLElement, text: string): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(".formula-token")).filter(
    (node) => node.textContent === text
  );
}

export async function setNotebookSourceFormat(
  user: ReturnType<typeof userEventLib.setup>,
  format: "json" | "markdown"
): Promise<void> {
  const editorTab = screen.getByRole("tab", { name: /^editor$/i });
  if (editorTab.getAttribute("aria-selected") !== "true") {
    await user.click(editorTab);
  }

  const downloadButton = screen.getByRole("button", { name: /download /i });
  const currentFormat = (downloadButton.textContent ?? "").toLowerCase().includes("markdown")
    ? "markdown"
    : "json";

  if (currentFormat !== format) {
    await user.click(screen.getByRole("button", { name: /source format is /i }));
  }
}
