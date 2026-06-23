import { Document as YamlDocument, isScalar, isSeq, Scalar } from "yaml";
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
  markWrappedInitialValueFlowSequences(document);
  markWrappedChartAxisGroupFlowSequences(document);

  return document.toString({
    collectionStyle: "any",
    flowCollectionPadding: false,
    lineWidth: 0
  }).trimEnd();
}

export function markWrappedMatrixFlowSequences(document: YamlDocument): void {
  const cells = document.get("cells", true);
  if (!isSeq(cells)) {
    return;
  }

  cells.items.forEach((_cell, index) => {
    markMatrixFlowSequencesAtPath(document, ["cells", index, "matrix"]);
  });
}

export function markWrappedEquationFlowSequences(document: YamlDocument): void {
  markWrappedCellRowFlowSequences(document, "equations", { quoteColumn: 2 });
}

export function markWrappedExternalFlowSequences(document: YamlDocument): void {
  markWrappedCellRowFlowSequences(document, "externals", { quoteColumn: 2 });
}

export function markWrappedInitialValueFlowSequences(document: YamlDocument): void {
  markWrappedCellRowFlowSequences(document, "initial-values");
}

export function markWrappedCellRowFlowSequences(
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
      }
    });
  });
}


export function markWrappedChartAxisGroupFlowSequences(document: YamlDocument): void {
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

export function markMatrixFlowSequences(document: YamlDocument, matrixKey: "balance" | "transactions"): void {
  markMatrixFlowSequencesAtPath(document, [matrixKey]);
}

export function markMatrixFlowSequencesAtPath(document: YamlDocument, matrixPath: Array<string | number>): void {
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

export function markFlowSequence(document: YamlDocument, path: Array<string | number>): void {
  const node = document.getIn(path, true);
  if (isSeq(node)) {
    node.flow = true;
  }
}
