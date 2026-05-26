// @vitest-environment jsdom

import { render, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { VariableCatalogPanel } from "../src/components/VariableCatalogPanel";
import type { VariableCatalogRow } from "../src/lib/variableCatalog";

const mockRows: VariableCatalogRow[] = Array.from({ length: 40 }, (_, index) => ({
  name: `V${index}`,
  description: `Variable ${index}`,
  value: index,
  valueSource: "run" as const,
  endogenousExogenous: "endogenous" as const,
  variableType: "flow" as const,
  stockFlow: "flow" as const,
  unitText: "$/yr",
  equationRole: "identity" as const,
  modelId: "sim",
  modelTitle: "SIM",
  externalKind: null,
  externalValueText: null,
  initialValue: null,
  currentDependencies: [],
  lagDependencies: [],
  modelSource: { sourceModelId: "sim" }
}));

describe("VariableCatalogPanel", () => {
  it("does not enter a render loop on mount with a selected variable", async () => {
    let renderCount = 0;

    function Probe() {
      renderCount += 1;
      return (
        <VariableCatalogPanel
          catalogModelContexts={[]}
          hasPendingParameterOverrides={false}
          onApplyParameterOverrides={() => undefined}
          onDiscardParameterOverrides={() => undefined}
          onParameterOverrideChange={() => undefined}
          onParameterOverrideRelease={() => undefined}
          parameterOverrides={{}}
          rows={mockRows}
          selectedVariable="V5"
          onSelectRow={() => undefined}
        />
      );
    }

    render(<Probe />);

    await new Promise((resolve) => setTimeout(resolve, 400));
    const renderCountAfter400ms = renderCount;

    await new Promise((resolve) => setTimeout(resolve, 400));
    const renderCountAfter800ms = renderCount;

    await new Promise((resolve) => setTimeout(resolve, 400));
    const renderCountAfter1200ms = renderCount;

    expect(renderCountAfter400ms, `render count after 400ms: ${renderCountAfter400ms}`).toBeLessThan(12);
    expect(renderCountAfter800ms, `render count after 800ms: ${renderCountAfter800ms}`).toBe(
      renderCountAfter400ms
    );
    expect(renderCountAfter1200ms, `render count after 1200ms: ${renderCountAfter1200ms}`).toBe(
      renderCountAfter800ms
    );
  });
});
