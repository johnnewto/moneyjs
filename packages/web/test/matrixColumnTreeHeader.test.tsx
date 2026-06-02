// @vitest-environment jsdom

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MatrixColumnTreeHeader } from "../src/notebook/components/MatrixColumnTreeHeader";
import type { MatrixColumnHeaderCell } from "@sfcr/notebook-core";

const columnRow: MatrixColumnHeaderCell[] = [
  {
    nodeId: "col:0",
    label: "Deposits",
    colSpan: 1,
    rowSpan: 1,
    columnIndex: 0,
    isLeaf: true,
    isExpandable: false,
    isSectorStart: true
  }
];

describe("MatrixColumnTreeHeader", () => {
  it("renders a single column row with corner and sum cells in column-row variant", () => {
    const { container } = render(
      <table>
        <tbody>
          <MatrixColumnTreeHeader
            headerRows={[["Households"], columnRow]}
            columns={["Deposits", "Sum"]}
            sectors={["Households", ""]}
            sumColumnIndex={1}
            collapsedNodeIds={new Set()}
            editorLinked={false}
            variant="column-row"
            onToggleNode={() => undefined}
            matrixCellId="matrix-test"
          />
        </tbody>
      </table>
    );

    const rows = container.querySelectorAll("tr");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.querySelectorAll("th")).toHaveLength(3);
    expect(rows[0]?.textContent).toContain("Transaction");
    expect(rows[0]?.textContent).toContain("Deposits");
    expect(rows[0]?.textContent).toContain("Sum");
  });
});
