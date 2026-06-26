import { Document as YamlDocument, isMap, isScalar, isSeq, Scalar } from "yaml";
import type { NotebookCell } from "../types";
import type { NotebookYamlEnvelope } from "./documentTypes";

export function stringifyCompactYamlEnvelope(envelope: NotebookYamlEnvelope): string {
  const document = new YamlDocument(envelope, { aliasDuplicateObjects: false });
  markFlowSequence(document, ["sectors"]);
  markMatrixFlowSequences(document, "balance");
  markMatrixFlowSequences(document, "transactions");
  markWrappedMatrixFlowSequences(document);
  markWrappedEquationFlowSequences(document);
  markWrappedExternalFlowSequences(document);
  markWrappedObservedFlowSequences(document);
  markWrappedInitialValueFlowSequences(document);
  markWrappedRunFlowSequences(document);
  markWrappedChartAxisGroupFlowSequences(document);
  markWrappedChartGridFlowSequences(document);

  return document.toString({
    collectionStyle: "any",
    flowCollectionPadding: false,
    lineWidth: 0
  }).trimEnd();
}

function markWrappedMatrixFlowSequences(document: YamlDocument): void {
  const cells = document.get("cells", true);
  if (!isSeq(cells)) {
    return;
  }

  cells.items.forEach((_cell, index) => {
    markMatrixFlowSequencesAtPath(document, ["cells", index, "matrix"]);
  });
}

function markWrappedEquationFlowSequences(document: YamlDocument): void {
  markWrappedCellRowFlowSequences(document, "equations", { quoteColumn: 2 });
}

function markWrappedExternalFlowSequences(document: YamlDocument): void {
  markWrappedCellRowFlowSequences(document, "externals", { quoteColumn: 2 });
}

function markWrappedObservedFlowSequences(document: YamlDocument): void {
  markWrappedCellRowFlowSequences(document, "observed", { quoteColumn: 2 });
}

function markWrappedInitialValueFlowSequences(document: YamlDocument): void {
  markWrappedCellRowFlowSequences(document, "initial-values");
}

function markWrappedRunFlowSequences(document: YamlDocument): void {
  const cells = document.get("cells", true);
  if (!isSeq(cells)) {
    return;
  }

  cells.items.forEach((_cell, index) => {
    const exogenize = document.getIn(["cells", index, "run", "exogenize"], true);
    if (isSeq(exogenize) && exogenize.items.every((item) => isScalar(item))) {
      exogenize.flow = true;
    }
  });
}

function markWrappedCellRowFlowSequences(
  document: YamlDocument,
  cellType: NotebookCell["type"],
  options: { quoteColumn?: number } = {}
): void {
  const cells = document.get("cells", true);
  if (!isSeq(cells)) {
    return;
  }

  cells.items.forEach((_cell, index) => {
    const rows = document.getIn(["cells", index, cellType, "rows"], true);
    if (!isSeq(rows)) {
      return;
    }
    rows.items.forEach((row) => {
      if (isSeq(row)) {
        row.flow = true;
        const description = options.quoteColumn == null ? undefined : row.items[options.quoteColumn];
        if (isScalar(description) && typeof description.value === "string" && description.value !== "") {
          description.type = Scalar.QUOTE_DOUBLE;
        }
        return;
      }

      if (isMap(row)) {
        row.flow = true;
      }
    });
  });
}


function markWrappedChartAxisGroupFlowSequences(document: YamlDocument): void {
  const cells = document.get("cells", true);
  if (!isSeq(cells)) {
    return;
  }

  cells.items.forEach((_cell, index) => {
    const groups = document.getIn(["cells", index, "chart", "axisGroups"], true);
    if (!isSeq(groups)) {
      return;
    }
    groups.items.forEach((group) => {
      if (isSeq(group)) {
        group.flow = true;
      }
    });
  });
}

function markWrappedChartGridFlowSequences(document: YamlDocument): void {
  const cells = document.get("cells", true);
  if (!isSeq(cells)) {
    return;
  }

  cells.items.forEach((_cell, index) => {
    const charts = document.getIn(["cells", index, "chart-grid", "charts"], true);
    if (!isSeq(charts)) {
      return;
    }

    charts.flow = false;
    charts.items.forEach((_chart, chartIndex) => {
      const chart = document.getIn(["cells", index, "chart-grid", "charts", chartIndex], true);
      if (isMap(chart)) {
        chart.flow = true;
      }

      markFlowSequence(document, ["cells", index, "chart-grid", "charts", chartIndex, "variables"]);
      markFlowSequence(document, ["cells", index, "chart-grid", "charts", chartIndex, "timeRangeInclusive"]);

      const axisGroups = document.getIn(["cells", index, "chart-grid", "charts", chartIndex, "axisGroups"], true);
      if (isSeq(axisGroups)) {
        axisGroups.flow = true;
        axisGroups.items.forEach((group) => {
          if (isSeq(group)) {
            group.flow = true;
          }
        });
      }

      const series = document.getIn(["cells", index, "chart-grid", "charts", chartIndex, "series"], true);
      if (isSeq(series)) {
        series.flow = true;
        series.items.forEach((entry) => {
          if (isMap(entry)) {
            entry.flow = true;
          }
        });
      }
    });
  });
}

function markMatrixFlowSequences(document: YamlDocument, matrixKey: "balance" | "transactions"): void {
  markMatrixFlowSequencesAtPath(document, [matrixKey]);
}

function markMatrixFlowSequencesAtPath(document: YamlDocument, matrixPath: Array<string | number>): void {
  markFlowSequence(document, [...matrixPath, "columns"]);
  markFlowSequence(document, [...matrixPath, "sectors"]);
  markFlowSequence(document, [...matrixPath, "columnBadges"]);
  markFlowSequence(document, [...matrixPath, "variables"]);

  const rows = document.getIn([...matrixPath, "rows"], true);
  if (!isSeq(rows)) {
    return;
  }

  rows.items.forEach((row) => {
    if (isSeq(row)) {
      row.flow = true;
    }
  });
}

function markFlowSequence(document: YamlDocument, path: Array<string | number>): void {
  const node = document.getIn(path, true);
  if (isSeq(node)) {
    node.flow = true;
  }
}
