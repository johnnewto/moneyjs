import type { VariableDescriptions } from "../lib/variableDescriptions";
import { formatValueWithUnits, type VariableUnitMetadata } from "../lib/unitMeta";
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
  variableUnitMetadata?: VariableUnitMetadata;
}

export function ResultTable({
  title,
  rows,
  selectedIndex = 0,
  variableDescriptions,
  variableUnitMetadata
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
                  variableUnitMetadata={variableUnitMetadata}
                />
              </td>
              <td>{formatNumber(row.start, row.name, variableUnitMetadata)}</td>
              <td>{formatNumber(row.selected, row.name, variableUnitMetadata)}</td>
              <td>{formatNumber(row.end, row.name, variableUnitMetadata)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function formatNumber(
  value: number,
  variableName: string,
  variableUnitMetadata?: VariableUnitMetadata
): string {
  if (!Number.isFinite(value)) {
    return "NaN";
  }
  return formatValueWithUnits(value, variableUnitMetadata?.get(variableName), {
    maximumFractionDigits: 6
  });
}
