// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent as testingFireEvent, screen as testingScreen, waitFor } from "@testing-library/react";
import userEventLib from "@testing-library/user-event";
import { EditorView } from "@codemirror/view";
import { runBaseline as runCoreBaseline } from "@sfcr/core";
import { afterEach, beforeAll, beforeEach, vi } from "vitest";

import { bmwBaselineModel, bmwBaselineOptions } from "../../core/src/fixtures/bmw";
import { App as AppComponent } from "../src/app/App";
import { getRouteFromHash } from "../src/app/routes";
import { NotebookApp } from "../src/notebook/NotebookApp";

export const fireEvent = testingFireEvent;
export const screen = testingScreen;
export const userEvent = userEventLib;

export function App(): JSX.Element {
  return getRouteFromHash(window.location.hash) === "notebook" ? <NotebookApp /> : <AppComponent />;
}

export const runBaseline = vi.fn();
export const runScenario = vi.fn();
export const validate = vi.fn();
export const bmwNotebookBaselineResult = runCoreBaseline(bmwBaselineModel, bmwBaselineOptions);

export let notebookRunnerMock: {
  outputs: Record<string, { type: "result"; result: typeof bmwNotebookBaselineResult }>;
  status: Record<string, "idle" | "running" | "success" | "error">;
  errors: Record<string, string | undefined>;
  historyUpdates?: Record<string, number | undefined>;
  runCell: ReturnType<typeof vi.fn>;
  runAll: ReturnType<typeof vi.fn>;
  getResult: (cellId: string) => typeof bmwNotebookBaselineResult | null;
  getPreviousResult: (cellId: string) => typeof bmwNotebookBaselineResult | null;
};

vi.mock("../src/hooks/useSolver", () => ({
  useSolver: () => ({
    status: "idle" as const,
    result: null,
    error: null,
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
      getResult: () => null,
      getPreviousResult: () => null
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
    getResult: (requestedCellId: string) => (requestedCellId === cellId ? result : null),
    getPreviousResult: () => null
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
  format: "json" | "markdown" | "yaml"
): Promise<void> {
  const editorTab = screen.getByRole("tab", { name: /^editor$/i });
  if (editorTab.getAttribute("aria-selected") !== "true") {
    await user.click(editorTab);
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const downloadButton = screen.getByRole("button", { name: /download /i });
    const currentFormat = resolveNotebookSourceFormatFromText(downloadButton.textContent ?? "");
    if (currentFormat === format) {
      break;
    }
    await user.click(screen.getByRole("button", { name: /source format is /i }));
  }

  if (format !== "markdown") {
    await screen.findByRole("textbox", { name: /notebook source editor/i });
    await waitFor(() => {
      if (!document.querySelector(".notebook-code-editor .cm-scroller")) {
        throw new Error("Notebook source editor has not finished mounting yet.");
      }
    });
    return;
  }

  await screen.findByTestId("notebook-source-text");
}

export async function expectVariableInspectorOpen(timeout = 3500): Promise<void> {
  await testingScreen.findByText("Selected variable", undefined, { timeout });
}

/** Clicks a variable token that schedules inspect after ~400ms (matrix / equation expression). */
export async function clickForDeferredVariableInspect(target: Element): Promise<void> {
  vi.useFakeTimers();
  try {
    testingFireEvent.click(target);
    await act(async () => {
      vi.advanceTimersByTime(450);
    });
  } finally {
    vi.useRealTimers();
  }
  await expectVariableInspectorOpen();
}

function resolveNotebookSourceFormatFromText(text: string): "json" | "markdown" | "yaml" {
  const normalized = text.toLowerCase();
  if (normalized.includes("markdown")) {
    return "markdown";
  }
  if (normalized.includes("yaml")) {
    return "yaml";
  }
  return "json";
}
