// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { NotebookEquationReadRow } from "../src/notebook/components/EquationRowInlineEditor";

describe("NotebookEquationReadRow document highlight", () => {
  it("marks the equation name button when it matches the highlighted variable", () => {
    render(
      <NotebookEquationReadRow
        currentValues={{}}
        equation={{
          id: "eq-y",
          name: "Y",
          expression: "Cs + Is",
          desc: "Income = GDP"
        }}
        equationIndex={0}
        formatRoleLabel={() => "Identity"}
        highlightedVariable="Y"
        hoveredRowId={null}
        isEditing={false}
        parameterNames={new Set()}
        rowDraft={{ expression: "Cs + Is", name: "Y" }}
        rowEditFocus="expression"
        rowValidationError={null}
        traceRole={null}
        onApplyRow={() => undefined}
        onBeginRowEdit={() => undefined}
        onCancelRow={() => undefined}
        onDraftExpressionChange={() => undefined}
        onDraftNameChange={() => undefined}
        onInspectVariable={() => undefined}
        onRowClick={() => undefined}
        onRowMouseEnter={() => undefined}
        onRowMouseLeave={() => undefined}
      />
    );

    expect(document.querySelector(".result-variable-button.is-document-highlighted")).not.toBeNull();
  });
});
