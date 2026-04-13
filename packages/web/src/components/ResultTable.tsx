import type { VariableDescriptions } from "../lib/variableDescriptions";
import { VariableLabel } from "./VariableLabel";

interface ResultRow {
  description?: string;
  name: string;
  selected: number;
  start: number;
  end: number;
}

interface ResultTableProps {
  selectedIndex?: number;
  title: string;
  rows: ResultRow[];
  variableDescriptions?: VariableDescriptions;
}

export function ResultTable({
  title,
  rows,
  selectedIndex = 0,
  variableDescriptions
}: ResultTableProps) {
  return (
    <section className="result-panel">
      <h2>{title}</h2>
      <table>
        <thead>
          <tr>
            <th>Variable</th>
            <th>Period 1</th>
            <th>Period {selectedIndex + 1}</th>
            <th>Last period</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name}>
              <td>
                <VariableLabel
                  description={row.description}
                  name={row.name}
                  variableDescriptions={variableDescriptions}
                />
              </td>
              <td>{formatNumber(row.start)}</td>
              <td>{formatNumber(row.selected)}</td>
              <td>{formatNumber(row.end)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return "NaN";
  }
  return value.toLocaleString(undefined, { maximumFractionDigits: 6 });
}
