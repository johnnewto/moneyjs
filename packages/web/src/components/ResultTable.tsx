import type { VariableDescriptions } from "../lib/variableDescriptions";
import type { VariableUnitMetadata } from "../lib/unitMeta";
import { NumericValueText } from "./NumericValueText";
import { VariableLabel } from "./VariableLabel";

interface ResultRow {
  description?: string;
  name: string;
  selected: number;
  start: number;
  end: number;
}

interface ResultTableProps {
  onSelectVariable?(variableName: string): void;
  selectedIndex?: number;
  title: string;
  rows: ResultRow[];
  variableDescriptions?: VariableDescriptions;
  variableUnitMetadata?: VariableUnitMetadata;
}

export function ResultTable({
  onSelectVariable,
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
                {onSelectVariable ? (
                  <button
                    type="button"
                    className="result-variable-button"
                    onClick={() => onSelectVariable(row.name)}
                  >
                    <VariableLabel
                      currentValues={{ [row.name]: row.selected }}
                      description={row.description}
                      name={row.name}
                      variableDescriptions={variableDescriptions}
                      variableUnitMetadata={variableUnitMetadata}
                    />
                  </button>
                ) : (
                  <VariableLabel
                    currentValues={{ [row.name]: row.selected }}
                    description={row.description}
                    name={row.name}
                    variableDescriptions={variableDescriptions}
                    variableUnitMetadata={variableUnitMetadata}
                  />
                )}
              </td>
              <td>
                <NumericValueText
                  unitMeta={variableUnitMetadata?.get(row.name)}
                  value={row.start}
                  options={{ maximumFractionDigits: 6 }}
                />
              </td>
              <td>
                <NumericValueText
                  unitMeta={variableUnitMetadata?.get(row.name)}
                  value={row.selected}
                  options={{ maximumFractionDigits: 6 }}
                />
              </td>
              <td>
                <NumericValueText
                  unitMeta={variableUnitMetadata?.get(row.name)}
                  value={row.end}
                  options={{ maximumFractionDigits: 6 }}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
