import { externalRowsOnly, initialValueRowsOnly } from "@sfcr/notebook-core";

import type {
  ExternalsCell,
  InitialValuesCell,
  NotebookCell,
  ObservedCell,
  SolverCell
} from "../../notebook/types";

export function PublicationAppendixSection({ cell }: { cell: NotebookCell }) {
  switch (cell.type) {
    case "externals":
    case "observed":
      return <PublicationExternals cell={cell} />;
    case "initial-values":
      return <PublicationInitialValues cell={cell} />;
    case "solver":
      return <PublicationSolver cell={cell} />;
    default:
      return null;
  }
}

function PublicationExternals({ cell }: { cell: ExternalsCell | ObservedCell }) {
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

