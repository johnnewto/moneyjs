// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import {
  resolveNotebookFloatingHeaderAnchor,
  syncMatrixFloatingTableColumnWidths
} from "../src/notebook/syncMatrixFloatingTableLayout";

describe("resolveNotebookFloatingHeaderAnchor", () => {
  it("uses the table box when the table fits inside the scroll wrap", () => {
    expect(
      resolveNotebookFloatingHeaderAnchor(
        { left: 20, width: 800 },
        { left: 120, width: 540 }
      )
    ).toEqual({ left: 120, width: 540 });
  });

  it("uses the wrap viewport when the table overflows horizontally", () => {
    expect(
      resolveNotebookFloatingHeaderAnchor(
        { left: 20, width: 800 },
        { left: 20, width: 1400 }
      )
    ).toEqual({ left: 20, width: 800 });
  });

  it("falls back to the wrap when no table is available", () => {
    expect(resolveNotebookFloatingHeaderAnchor({ left: 12, width: 640 }, null)).toEqual({
      left: 12,
      width: 640
    });
  });
});

describe("syncMatrixFloatingTableColumnWidths", () => {
  it("copies measured header widths onto the floating table", () => {
    const sourceTable = document.createElement("table");
    sourceTable.innerHTML = `
      <colgroup>
        <col />
        <col />
        <col />
      </colgroup>
      <thead>
        <tr>
          <th style="width: 80px">Corner</th>
          <th style="width: 144px">Deposits</th>
          <th style="width: 64px">Sum</th>
        </tr>
      </thead>
    `;
    document.body.appendChild(sourceTable);

    const sourceRow = sourceTable.tHead!.rows[0]!;
    Object.defineProperty(sourceRow.cells[0], "getBoundingClientRect", {
      value: () => ({ width: 80 } as DOMRect)
    });
    Object.defineProperty(sourceRow.cells[1], "getBoundingClientRect", {
      value: () => ({ width: 144 } as DOMRect)
    });
    Object.defineProperty(sourceRow.cells[2], "getBoundingClientRect", {
      value: () => ({ width: 64 } as DOMRect)
    });
    Object.defineProperty(sourceTable, "scrollWidth", {
      value: 292,
      configurable: true
    });

    const targetTable = document.createElement("table");
    targetTable.innerHTML = `
      <colgroup>
        <col />
        <col />
        <col />
      </colgroup>
      <thead>
        <tr>
          <th>Corner</th>
          <th>Deposits</th>
          <th>Sum</th>
        </tr>
      </thead>
    `;
    document.body.appendChild(targetTable);

    syncMatrixFloatingTableColumnWidths(sourceRow, targetTable);

    const targetRow = targetTable.tHead!.rows[0]!;
    expect(targetRow.cells[0]?.style.width).toBe("80px");
    expect(targetRow.cells[1]?.style.width).toBe("144px");
    expect(targetRow.cells[2]?.style.width).toBe("68px");
    expect(targetTable.style.tableLayout).toBe("fixed");
    expect(targetTable.style.width).toBe("292px");
    expect(targetTable.style.minWidth).toBe("292px");

    sourceTable.remove();
    targetTable.remove();
  });

  it("uses the source table width without stretching to the scroll wrapper", () => {
    const wrap = document.createElement("div");
    const sourceTable = document.createElement("table");
    sourceTable.innerHTML = `
      <colgroup>
        <col />
        <col />
        <col />
      </colgroup>
      <thead>
        <tr>
          <th>Corner</th>
          <th>Deposits</th>
          <th>Sum</th>
        </tr>
      </thead>
    `;
    wrap.appendChild(sourceTable);
    document.body.appendChild(wrap);

    const sourceRow = sourceTable.tHead!.rows[0]!;
    Object.defineProperty(sourceRow.cells[0], "getBoundingClientRect", {
      value: () => ({ width: 80 } as DOMRect)
    });
    Object.defineProperty(sourceRow.cells[1], "getBoundingClientRect", {
      value: () => ({ width: 144 } as DOMRect)
    });
    Object.defineProperty(sourceRow.cells[2], "getBoundingClientRect", {
      value: () => ({ width: 64 } as DOMRect)
    });
    Object.defineProperty(sourceTable, "scrollWidth", {
      value: 800,
      configurable: true
    });
    Object.defineProperty(wrap, "scrollWidth", {
      value: 1400,
      configurable: true
    });

    const targetTable = document.createElement("table");
    targetTable.innerHTML = `
      <colgroup>
        <col />
        <col />
        <col />
      </colgroup>
      <thead>
        <tr>
          <th>Corner</th>
          <th>Deposits</th>
          <th>Sum</th>
        </tr>
      </thead>
    `;
    document.body.appendChild(targetTable);

    syncMatrixFloatingTableColumnWidths(sourceRow, targetTable);

    const targetRow = targetTable.tHead!.rows[0]!;
    expect(targetRow.cells[0]?.style.width).toBe("80px");
    expect(targetRow.cells[1]?.style.width).toBe("144px");
    expect(targetRow.cells[2]?.style.width).toBe("576px");
    expect(targetTable.style.width).toBe("800px");

    wrap.remove();
    targetTable.remove();
  });

  it("keeps floating columns aligned when the source column row follows a row-spanning corner header", () => {
    const sourceTable = document.createElement("table");
    sourceTable.innerHTML = `
      <colgroup>
        <col />
        <col />
        <col />
      </colgroup>
      <thead>
        <tr>
          <th rowspan="2">Transaction</th>
          <th>Households</th>
          <th>Sum</th>
        </tr>
        <tr>
          <th>Deposits</th>
          <th>Sum</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <th>Consumption</th>
          <td>-C</td>
          <td>0</td>
        </tr>
      </tbody>
    `;
    document.body.appendChild(sourceTable);

    const sourceColumnRow = sourceTable.tHead!.rows[1]!;
    Object.defineProperty(sourceColumnRow.cells[0], "getBoundingClientRect", {
      value: () => ({ width: 144 } as DOMRect)
    });
    Object.defineProperty(sourceColumnRow.cells[1], "getBoundingClientRect", {
      value: () => ({ width: 64 } as DOMRect)
    });
    const bodyRow = sourceTable.tBodies[0]!.rows[0]!;
    Object.defineProperty(bodyRow.cells[0], "getBoundingClientRect", {
      value: () => ({ width: 96 } as DOMRect)
    });
    Object.defineProperty(bodyRow.cells[1], "getBoundingClientRect", {
      value: () => ({ width: 144 } as DOMRect)
    });
    Object.defineProperty(bodyRow.cells[2], "getBoundingClientRect", {
      value: () => ({ width: 64 } as DOMRect)
    });

    const targetTable = document.createElement("table");
    targetTable.innerHTML = `
      <colgroup>
        <col />
        <col />
        <col />
      </colgroup>
      <thead>
        <tr>
          <th>Transaction</th>
          <th>Deposits</th>
          <th>Sum</th>
        </tr>
      </thead>
    `;
    document.body.appendChild(targetTable);

    syncMatrixFloatingTableColumnWidths(sourceColumnRow, targetTable);

    const targetRow = targetTable.tHead!.rows[0]!;
    expect(targetRow.cells[0]?.style.width).toBe("96px");
    expect(targetRow.cells[1]?.style.width).toBe("144px");
    expect(targetRow.cells[2]?.style.width).toBe("64px");

    sourceTable.remove();
    targetTable.remove();
  });

  it("keeps column indices aligned when an earlier header cell measures zero", () => {
    const sourceTable = document.createElement("table");
    sourceTable.innerHTML = `
      <colgroup>
        <col />
        <col />
        <col />
      </colgroup>
      <thead>
        <tr>
          <th>Corner</th>
          <th>Deposits</th>
          <th>Sum</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <th>Row</th>
          <td>100</td>
          <td>0</td>
        </tr>
      </tbody>
    `;
    document.body.appendChild(sourceTable);

    const sourceRow = sourceTable.tHead!.rows[0]!;
    Object.defineProperty(sourceRow.cells[0], "getBoundingClientRect", {
      value: () => ({ width: 0 } as DOMRect)
    });
    Object.defineProperty(sourceRow.cells[1], "getBoundingClientRect", {
      value: () => ({ width: 144 } as DOMRect)
    });
    Object.defineProperty(sourceRow.cells[2], "getBoundingClientRect", {
      value: () => ({ width: 64 } as DOMRect)
    });
    const bodyRow = sourceTable.tBodies[0]!.rows[0]!;
    Object.defineProperty(bodyRow.cells[0], "getBoundingClientRect", {
      value: () => ({ width: 80 } as DOMRect)
    });

    const targetTable = document.createElement("table");
    targetTable.innerHTML = `
      <colgroup>
        <col />
        <col />
        <col />
      </colgroup>
      <thead>
        <tr>
          <th>Corner</th>
          <th>Deposits</th>
          <th>Sum</th>
        </tr>
      </thead>
    `;
    document.body.appendChild(targetTable);

    syncMatrixFloatingTableColumnWidths(sourceRow, targetTable);

    const targetRow = targetTable.tHead!.rows[0]!;
    expect(targetRow.cells[0]?.style.width).toBe("80px");
    expect(targetRow.cells[1]?.style.width).toBe("144px");
    expect(targetRow.cells[2]?.style.width).toBe("64px");

    sourceTable.remove();
    targetTable.remove();
  });
});
