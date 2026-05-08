// @vitest-environment jsdom

import { render, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { App, screen, setSuccessfulNotebookRunner, setupAppTestEnv } from "./appTestUtils";

setupAppTestEnv();

describe("App balance matrix stock-role chips", () => {
  it("shows stock-role chips on the BMW balance sheet but not the transaction-flow matrix", () => {
    window.location.hash = "#/notebook";
    setSuccessfulNotebookRunner();

    render(<App />);

    const balanceHeading = screen.getByRole("heading", { name: /bmw balance sheet/i });
    const balanceCell = balanceHeading.closest("article");
    expect(balanceCell).not.toBeNull();
    if (!balanceCell) {
      throw new Error("Expected BMW balance-sheet matrix article.");
    }

    const depositsRow = within(balanceCell).getByText("Money deposits").closest("tr");
    expect(depositsRow).not.toBeNull();
    if (!depositsRow) {
      throw new Error("Expected money deposits row.");
    }
    expect(within(depositsRow).getByText("A")).toBeInTheDocument();
    expect(within(depositsRow).getByText("L")).toBeInTheDocument();

    const balanceRow = within(balanceCell).getByText("Balance (net worth)").closest("tr");
    expect(balanceRow).not.toBeNull();
    if (!balanceRow) {
      throw new Error("Expected net worth row.");
    }
    expect(within(balanceRow).getAllByText("E").length).toBeGreaterThan(0);

    const transactionHeading = screen.getByRole("heading", { name: /bmw transactions-flow matrix/i });
    const transactionCell = transactionHeading.closest("article");
    expect(transactionCell).not.toBeNull();
    if (!transactionCell) {
      throw new Error("Expected BMW transaction-flow matrix article.");
    }

    expect(within(transactionCell).queryByText("A")).toBeNull();
    expect(within(transactionCell).queryByText("L")).toBeNull();
    expect(within(transactionCell).queryByText("E")).toBeNull();
  });
});