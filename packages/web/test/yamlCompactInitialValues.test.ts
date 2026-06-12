import { describe, expect, it } from "vitest";

import { parseCompactInitialValueRows } from "@sfcr/notebook-core";

describe("compact YAML initial value rows", () => {
  it("ignores trailing stockFlow token when parsing initial value rows", () => {
    const rows = [
      ["v", 86.49, "Initial household wealth.", "aux"],
      ["b_h", 64.87, "Initial household bill holdings.", "aux"]
    ];

    const parsed = parseCompactInitialValueRows(rows);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({
      id: "init-0-v",
      name: "v",
      desc: "Initial household wealth.",
      valueText: "86.49"
    });
    expect(parsed[1]).toMatchObject({
      id: "init-1-b_h",
      name: "b_h",
      desc: "Initial household bill holdings.",
      valueText: "64.87"
    });
    expect(new Set(parsed.map((row) => (row as { id: string }).id))).toEqual(
      new Set(["init-0-v", "init-1-b_h"])
    );
  });

  it("preserves explicit init ids in compact initial value rows", () => {
    const rows = [["p1", 1, "Initial agriculture price.", "init-custom-p1"]];

    const [parsed] = parseCompactInitialValueRows(rows);
    expect(parsed).toMatchObject({
      id: "init-custom-p1",
      name: "p1",
      desc: "Initial agriculture price.",
      valueText: "1"
    });
  });
});
