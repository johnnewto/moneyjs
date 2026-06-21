import type { SimulationResult } from "@sfcr/core";

import type { NotebookCell } from "../notebook/types";
import type { PublicationSection } from "./buildPublicationViewModel";
import { PublicationAppendixSection } from "./components/PublicationAppendix";
import { PublicationCaption } from "./components/PublicationCaption";
import { PublicationChart } from "./components/PublicationChart";
import { PublicationEquations } from "./components/PublicationEquations";
import { PublicationMarkdown } from "./components/PublicationMarkdown";
import { PublicationMatrix } from "./components/PublicationMatrix";
import { PublicationSequence } from "./components/PublicationSequence";
import { PublicationTable } from "./components/PublicationTable";
import type { MatrixGraphRequest } from "../notebook/matrixSliceGraph";
import type { PublicationVariableInteraction } from "./publicationInspect";

export function PublicationCellView({
  cells,
  getResult,
  interaction,
  onRequestMatrixGraph,
  section,
  selectedPeriodIndex,
  showHeading = true
}: {
  cells: NotebookCell[];
  getResult(runCellId: string): SimulationResult | null;
  interaction: PublicationVariableInteraction;
  onRequestMatrixGraph?(request: MatrixGraphRequest): void;
  section: PublicationSection;
  selectedPeriodIndex: number;
  showHeading?: boolean;
}) {
  const { cell } = section;

  if (section.kind === "prose" && cell.type === "markdown") {
    return (
      <section id={section.anchorId} className="publication-section publication-section-prose">
        {showHeading && cell.title.trim() ? (
          <h2 className="publication-section-heading">{cell.title}</h2>
        ) : null}
        <PublicationMarkdown interaction={interaction} source={cell.source} />
      </section>
    );
  }

  if (section.kind === "equations" && (cell.type === "equations" || cell.type === "model")) {
    return (
      <section id={section.anchorId} className="publication-section publication-section-equations">
        {showHeading ? <h2 className="publication-section-heading">{cell.title}</h2> : null}
        <PublicationEquations cell={cell} interaction={interaction} />
        {cell.description?.trim() || cell.note?.trim() ? (
          <PublicationCaption description={cell.description} note={cell.note} title={cell.title} />
        ) : null}
      </section>
    );
  }

  if (section.kind === "matrix" && cell.type === "matrix") {
    return (
      <figure id={section.anchorId} className="publication-section publication-section-matrix">
        <PublicationMatrix
          cell={cell}
          getResult={getResult}
          interaction={interaction}
          onRequestMatrixGraph={onRequestMatrixGraph}
        />
        <PublicationCaption description={cell.description} note={cell.note} title={cell.title} />
      </figure>
    );
  }

  if (section.kind === "sequence" && cell.type === "sequence") {
    return (
      <figure id={section.anchorId} className="publication-section publication-section-sequence">
        <PublicationSequence
          cell={cell}
          cells={cells}
          getResult={getResult}
          interaction={interaction}
          selectedPeriodIndex={selectedPeriodIndex}
        />
        <PublicationCaption description={cell.description} note={cell.note} title={cell.title} />
      </figure>
    );
  }

  if (section.kind === "chart" && cell.type === "chart") {
    const result = getResult(cell.sourceRunCellId);
    return (
      <figure id={section.anchorId} className="publication-section publication-section-chart">
        <PublicationChart
          cell={cell}
          cells={cells}
          interaction={interaction}
          result={result}
          selectedPeriodIndex={selectedPeriodIndex}
        />
        <PublicationCaption description={cell.description} note={cell.note} title={cell.title} />
      </figure>
    );
  }

  if (section.kind === "table" && cell.type === "table") {
    return (
      <figure id={section.anchorId} className="publication-section publication-section-table">
        <PublicationTable cell={cell} cells={cells} interaction={interaction} />
        <PublicationCaption description={cell.description} note={cell.note} title={cell.title} />
      </figure>
    );
  }

  if (section.kind === "appendix") {
    return (
      <section id={section.anchorId} className="publication-section publication-section-appendix">
        <h3 className="publication-appendix-heading">{cell.title}</h3>
        <PublicationAppendixSection cell={cell} />
      </section>
    );
  }

  return null;
}
