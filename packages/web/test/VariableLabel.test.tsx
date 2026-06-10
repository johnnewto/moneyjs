// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { NumericValueText } from "../src/components/NumericValueText";
import { VariableLabel } from "../src/components/VariableLabel";

afterEach(() => {
  cleanup();
});

describe("VariableLabel", () => {
  it("reuses resolveVariableTooltip for custom children without a unit badge", () => {
    const unitMeta = new Map([
      ["Y", { stockFlow: "flow" as const, signature: { money: 1, time: -1 } }]
    ]);
    const variableDescriptions = new Map([["Y", "Output"]]);
    const { container } = render(
      <VariableLabel
        className="notebook-current-value-tooltip-anchor"
        currentValue={14.511085}
        name="Y"
        variableDescriptions={variableDescriptions}
        variableUnitMetadata={unitMeta}
      >
        <NumericValueText
          decimalAligned
          unitMeta={unitMeta.get("Y")}
          value={14.511085}
          options={{ maximumFractionDigits: 2, minimumFractionDigits: 2 }}
        />
      </VariableLabel>
    );

    expect(container.querySelector(".unit-badge")).not.toBeInTheDocument();
    expect(container.querySelector(".notebook-current-value-fraction")).toHaveTextContent("51");
    fireEvent.mouseEnter(container.querySelector(".notebook-current-value-tooltip-anchor")!);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Output : $14.511085/yr");
  });
});
