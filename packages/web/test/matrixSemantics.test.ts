import { describe, expect, it } from "vitest";

import { classifyMatrixStockRole, inferMatrixTableKind } from "../src/notebook/matrixSemantics";
import type { MatrixCell } from "../src/notebook/types";

describe("matrix semantics", () => {
  it("treats net wealth labels as stock net-worth rows", () => {
    const cell: MatrixCell = {
      id: "matrix-net-wealth",
      type: "matrix",
      title: "Net wealth matrix",
      columns: ["Households", "Sum"],
      rows: [
        { band: "Balance", label: "Net Wealth", values: ["-Vh", "0"] },
        { band: "Sum", label: "Sum", values: ["0", "0"] }
      ]
    };

    expect(inferMatrixTableKind(cell)).toBe("stocks");
    expect(classifyMatrixStockRole("Net Wealth", "-Vh", -100)).toBe("netWorth");
  });
});