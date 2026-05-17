// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { WorkerRequest, WorkerResponse } from "../src/lib/workerClient";
import { useSolver } from "../src/hooks/useSolver";

class MockWorker {
  static instances: MockWorker[] = [];

  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null = null;

  constructor(_url: URL, _options: WorkerOptions) {
    MockWorker.instances.push(this);
  }

  postMessage(message: WorkerRequest): void {
    this.onmessage?.({
      data: {
        id: message.id,
        type: "error",
        payload: {
          name: "ModelValidationError",
          message: "Broken model"
        }
      }
    } as MessageEvent<WorkerResponse>);
  }

  terminate(): void {}
}

function ValidateFixture() {
  const solver = useSolver();

  async function handleValidate(): Promise<void> {
    try {
      await solver.validate(
        {
          equations: [{ name: "Y", expression: "missingExternal" }],
          externals: {},
          initialValues: {}
        },
        {
          periods: 5,
          solverMethod: "GAUSS_SEIDEL",
          tolerance: 1e-8,
          maxIterations: 50
        }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown validation error";
      document.body.setAttribute("data-caught-error", message);
    }
  }

  return (
    <>
      <button type="button" onClick={() => void handleValidate()}>
        Validate
      </button>
      <output>{solver.status}</output>
    </>
  );
}

describe("useSolver", () => {
  beforeEach(() => {
    MockWorker.instances = [];
    vi.stubGlobal("Worker", MockWorker as unknown as typeof Worker);
    vi.stubGlobal("crypto", { randomUUID: () => "test-id" } satisfies Pick<Crypto, "randomUUID">);
  });

  afterEach(() => {
    document.body.removeAttribute("data-caught-error");
    vi.unstubAllGlobals();
  });

  it("rethrows validation errors after updating error state", async () => {
    const user = userEvent.setup();
    render(<ValidateFixture />);

    await user.click(screen.getByRole("button", { name: /validate/i }));

    await waitFor(() => {
      expect(document.body).toHaveAttribute("data-caught-error", "Broken model");
      expect(screen.getByText("error")).toBeInTheDocument();
    });
  });
});
