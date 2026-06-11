import { formatScenarioShockVariableLabel, type ScenarioShockVariable } from "../lib/scenarioShockMarkers";
import { documentHighlightClassName } from "../lib/variableHighlight";
import { VariableMathLabel } from "./VariableMathLabel";

export function ScenarioShockVariableLine({
  entry,
  highlightedVariable = null,
  inspectButtonClassName = "",
  onInspect
}: {
  entry: ScenarioShockVariable;
  highlightedVariable?: string | null;
  inspectButtonClassName?: string;
  onInspect?(variableName: string): void;
}) {
  const content = (
    <span className="scenario-shock-variable-line">
      <VariableMathLabel name={entry.name} />
      <span className="scenario-shock-name-separator" aria-hidden="true">
        {": "}
      </span>
      {entry.originalValueText ? (
        <>
          <span className="scenario-shock-original">{entry.originalValueText}</span>
          <span className="scenario-shock-arrow" aria-hidden="true">
            {" → "}
          </span>
        </>
      ) : (
        <span className="scenario-shock-arrow" aria-hidden="true">
          {" → "}
        </span>
      )}
      <span className="scenario-shock-value">{entry.valueText}</span>
    </span>
  );

  if (!onInspect) {
    return content;
  }

  return (
    <button
      type="button"
      className={documentHighlightClassName(
        entry.name,
        highlightedVariable,
        `result-variable-button scenario-shock-variable-button ${inspectButtonClassName}`.trim()
      )}
      aria-label={`Inspect ${formatScenarioShockVariableLabel(entry)}`}
      onClick={() => onInspect(entry.name)}
    >
      {content}
    </button>
  );
}
