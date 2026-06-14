import { externalRowsOnly, initialValueRowsOnly } from "@sfcr/notebook-core";

import type {
  ExternalsCell,
  InitialValuesCell,
  NotebookCell,
  RunCell,
  SolverCell
} from "../../notebook/types";

export function PublicationAppendixSection({ cell }: { cell: NotebookCell }) {
  switch (cell.type) {
    case "externals":
      return <PublicationExternals cell={cell} />;
    case "initial-values":
      return <PublicationInitialValues cell={cell} />;
    case "solver":
      return <PublicationSolver cell={cell} />;
    case "run":
      return <PublicationRun cell={cell} />;
    default:
      return null;
  }
}

function PublicationExternals({ cell }: { cell: ExternalsCell }) {
  const rows = externalRowsOnly(cell.externals);

  return (
    <table className="publication-appendix-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Kind</th>
          <th>Value</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <td>{row.name}</td>
            <td>{row.kind}</td>
            <td>
              <code>{row.valueText}</code>
            </td>
            <td>{row.desc?.trim() || ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PublicationInitialValues({ cell }: { cell: InitialValuesCell }) {
  const rows = initialValueRowsOnly(cell.initialValues);

  return (
    <table className="publication-appendix-table">
      <thead>
        <tr>
          <th>Variable</th>
          <th>Value</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <td>{row.name}</td>
            <td>
              <code>{row.valueText}</code>
            </td>
            <td>{row.desc?.trim() || ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PublicationSolver({ cell }: { cell: SolverCell }) {
  const { options } = cell;

  return (
    <dl className="publication-appendix-list">
      <div>
        <dt>Solver method</dt>
        <dd>{options.solverMethod}</dd>
      </div>
      <div>
        <dt>Periods</dt>
        <dd>{options.periods}</dd>
      </div>
      <div>
        <dt>Tolerance</dt>
        <dd>{options.toleranceText}</dd>
      </div>
      <div>
        <dt>Max iterations</dt>
        <dd>{options.maxIterations}</dd>
      </div>
      <div>
        <dt>Default initial value</dt>
        <dd>{options.defaultInitialValueText}</dd>
      </div>
    </dl>
  );
}

function PublicationRun({ cell }: { cell: RunCell }) {
  return (
    <dl className="publication-appendix-list">
      <div>
        <dt>Mode</dt>
        <dd>{cell.mode}</dd>
      </div>
      <div>
        <dt>Periods</dt>
        <dd>{cell.periods}</dd>
      </div>
      <div>
        <dt>Result key</dt>
        <dd>{cell.resultKey}</dd>
      </div>
      {cell.baselineRunCellId ? (
        <div>
          <dt>Baseline run</dt>
          <dd>{cell.baselineRunCellId}</dd>
        </div>
      ) : null}
    </dl>
  );
}

export function hasAppendixContent(cell: NotebookCell): boolean {
  if (cell.type === "externals") {
    return externalRowsOnly(cell.externals).length > 0;
  }
  if (cell.type === "initial-values") {
    return initialValueRowsOnly(cell.initialValues).length > 0;
  }
  if (cell.type === "solver" || cell.type === "run") {
    return true;
  }
  return false;
}
