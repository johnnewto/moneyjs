import { ResultTable } from "../../components/ResultTable";
import type { EditorState } from "../../lib/editorModel";
import type { buildVariableUnitMetadata } from "../../lib/units";
import { getVariableDescription, type VariableDescriptions } from "../../lib/variableDescriptions";
import { buildEditorStateForNotebookModel } from "../modelSections";
import type { NotebookCell, RunCell, TableCell } from "../types";
import type { useNotebookRunner } from "../useNotebookRunner";

export function TableCellView({
  cell,
  cells,
  runner,
  selectedPeriodIndex,
  variableDescriptions,
  variableUnitMetadata,
  onVariableInspectRequest
}: {
  cell: TableCell;
  cells: NotebookCell[];
  runner: ReturnType<typeof useNotebookRunner>;
  selectedPeriodIndex: number;
  variableDescriptions: VariableDescriptions;
  variableUnitMetadata: ReturnType<typeof buildVariableUnitMetadata>;
  onVariableInspectRequest(args: {
    currentValues: Record<string, number | undefined>;
    editor: EditorState;
    selectedVariable: string;
    variableDescriptions: VariableDescriptions;
    variableUnitMetadata: ReturnType<typeof buildVariableUnitMetadata>;
  }): void;
}) {
  const result = runner.getResult(cell.sourceRunCellId);
  if (!result) {
    return <div className="status-hint">Run the source cell to populate this summary table.</div>;
  }
  const editor = resolveEditorStateForRunCellId(cells, cell.sourceRunCellId);
  const currentValues = Object.fromEntries(
    Object.entries(result.series).map(([name, values]) => [
      name,
      values[Math.min(selectedPeriodIndex, Math.max(values.length - 1, 0))]
    ])
  );

  const rows = cell.variables.map((name) => {
    const values = result.series[name] ?? [];
    return {
      description: getVariableDescription(variableDescriptions, name),
      name,
      selected: values[Math.min(selectedPeriodIndex, values.length - 1)] ?? NaN,
      start: values[0] ?? NaN,
      end: values[values.length - 1] ?? NaN
    };
  });

  return (
    <ResultTable
      title={cell.title}
      rows={rows}
      selectedIndex={selectedPeriodIndex}
      onSelectVariable={(selectedVariable) => {
        if (!editor) {
          return;
        }
        onVariableInspectRequest({
          currentValues,
          editor,
          selectedVariable,
          variableDescriptions,
          variableUnitMetadata
        });
      }}
      variableDescriptions={variableDescriptions}
      variableUnitMetadata={variableUnitMetadata}
    />
  );
}

function resolveEditorStateForRunCellId(cells: NotebookCell[], sourceRunCellId: string): EditorState | null {
  const sourceRunCell = cells.find((entry) => entry.id === sourceRunCellId);
  if (!sourceRunCell || sourceRunCell.type !== "run") {
    return null;
  }

  return buildEditorStateForNotebookModel(
    {
      id: "notebook",
      title: "notebook",
      metadata: { version: 1 },
      cells
    },
    sourceRunCell as RunCell
  );
}
