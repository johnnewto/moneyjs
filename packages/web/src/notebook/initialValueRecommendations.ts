import { parseEquation } from "@sfcr/core";
import { equationRowsOnly, isRowComment, type EquationListItem, type InitialValueListItem } from "@sfcr/notebook-core";

import type { EquationRow } from "../lib/editorModel";
import { collectDivisionDenominatorNames } from "../lib/equationDivisionAnalysis";
import { withInitialValueEnabled } from "../lib/initialValueEnable";
import { classifyMatrixEntrySource } from "./matrixVariableReference";
import type { MatrixCell, NotebookCell } from "./types";

export type InitialValueRecommendationReason =
  | "lagged"
  | "stock"
  | "denominator"
  | "balance-sheet";

export interface InitialValueRecommendation {
  name: string;
  reasons: InitialValueRecommendationReason[];
}

export interface InitialValueRecommendationCriteria {
  lagged: boolean;
  stock: boolean;
  denominator: boolean;
  balanceSheet: boolean;
}

export const DEFAULT_INITIAL_VALUE_RECOMMENDATION_CRITERIA: InitialValueRecommendationCriteria = {
  lagged: true,
  stock: true,
  denominator: true,
  balanceSheet: true
};

export interface InitialValueRecommendationSummary {
  recommendations: InitialValueRecommendation[];
  recommendedNames: Set<string>;
  counts: Record<InitialValueRecommendationReason, number>;
}

export function hasActiveInitialValueRecommendationCriteria(
  criteria: InitialValueRecommendationCriteria
): boolean {
  return criteria.lagged || criteria.stock || criteria.denominator || criteria.balanceSheet;
}

export function buildInitialValueRecommendations(args: {
  equations: EquationListItem[];
  cells?: NotebookCell[];
  criteria?: InitialValueRecommendationCriteria;
}): InitialValueRecommendationSummary {
  const criteria = args.criteria ?? DEFAULT_INITIAL_VALUE_RECOMMENDATION_CRITERIA;
  const equationRows = equationRowsOnly(args.equations);
  const endogenous = new Set(
    equationRows.map((equation) => equation.name.trim()).filter((name) => name.length > 0)
  );
  const reasonSets = new Map<string, Set<InitialValueRecommendationReason>>();

  const addReason = (name: string, reason: InitialValueRecommendationReason) => {
    const trimmed = name.trim();
    if (!trimmed || !endogenous.has(trimmed)) {
      return;
    }
    const bucket = reasonSets.get(trimmed) ?? new Set<InitialValueRecommendationReason>();
    bucket.add(reason);
    reasonSets.set(trimmed, bucket);
  };

  for (const equation of equationRows) {
    const name = equation.name.trim();
    const expression = equation.expression.trim();
    if (!name || !expression) {
      continue;
    }

    try {
      const parsed = parseEquation(name, expression);
      for (const lagged of parsed.lagDependencies) {
        addReason(lagged, "lagged");
      }
      if (isStockEquation(equation, parsed)) {
        addReason(name, "stock");
      }
      for (const divisor of collectDivisionDenominatorNames(parsed.sourceExpression)) {
        addReason(divisor, "denominator");
      }
    } catch {
      // Skip malformed equations during recommendation pass.
    }
  }

  for (const variable of collectBalanceSheetVariables(args.cells ?? [])) {
    addReason(variable, "balance-sheet");
  }

  const recommendations = [...reasonSets.entries()]
    .map(([name, reasons]) => ({
      name,
      reasons: [...reasons]
        .filter((reason) => reasonMatchesCriteria(reason, criteria))
        .sort()
    }))
    .filter((entry) => entry.reasons.length > 0)
    .sort((left, right) => left.name.localeCompare(right.name));

  const counts: Record<InitialValueRecommendationReason, number> = {
    lagged: 0,
    stock: 0,
    denominator: 0,
    "balance-sheet": 0
  };
  for (const recommendation of recommendations) {
    for (const reason of recommendation.reasons) {
      counts[reason] += 1;
    }
  }

  return {
    recommendations,
    recommendedNames: new Set(recommendations.map((entry) => entry.name)),
    counts
  };
}

export function applyInitialValueRecommendations(
  initialValues: InitialValueListItem[],
  recommendedNames: ReadonlySet<string>
): InitialValueListItem[] {
  const existingNames = new Set<string>();
  const next = initialValues.map((row) => {
    if (isRowComment(row)) {
      return row;
    }

    const name = row.name.trim();
    if (!name) {
      return row;
    }

    existingNames.add(name);
    return withInitialValueEnabled(row, recommendedNames.has(name));
  });

  for (const name of [...recommendedNames].sort((left, right) => left.localeCompare(right))) {
    if (existingNames.has(name)) {
      continue;
    }

    next.push({
      id: `init-${crypto.randomUUID()}`,
      name,
      desc: "",
      valueText: ""
    });
  }

  return next;
}

export function formatInitialValueRecommendationMessage(
  summary: InitialValueRecommendationSummary
): string {
  const { recommendations, counts } = summary;
  if (recommendations.length === 0) {
    return "No initial values matched the checklist for this model.";
  }

  const parts = [
    counts.lagged > 0 ? `${counts.lagged} lagged` : null,
    counts.stock > 0 ? `${counts.stock} stock` : null,
    counts.denominator > 0 ? `${counts.denominator} denominator` : null,
    counts["balance-sheet"] > 0 ? `${counts["balance-sheet"]} balance sheet` : null
  ].filter((part): part is string => part != null);

  return `Enabled ${recommendations.length} initial value${recommendations.length === 1 ? "" : "s"} (${parts.join(", ")}).`;
}

function reasonMatchesCriteria(
  reason: InitialValueRecommendationReason,
  criteria: InitialValueRecommendationCriteria
): boolean {
  switch (reason) {
    case "lagged":
      return criteria.lagged;
    case "stock":
      return criteria.stock;
    case "denominator":
      return criteria.denominator;
    case "balance-sheet":
      return criteria.balanceSheet;
  }
}

function isStockEquation(
  equation: EquationRow,
  parsed: ReturnType<typeof parseEquation>
): boolean {
  if (equation.unitMeta?.stockFlow === "stock") {
    return true;
  }

  return (
    parsed.sourceExpression.type === "Integral" || parsed.lagDependencies.includes(parsed.name)
  );
}

function collectBalanceSheetVariables(cells: NotebookCell[]): Set<string> {
  const names = new Set<string>();

  for (const cell of cells) {
    if (cell.type !== "matrix" || !isBalanceSheetMatrix(cell)) {
      continue;
    }

    for (const row of cell.rows) {
      for (const value of row.values) {
        const reference = classifyMatrixEntrySource(value);
        if (reference?.variableName.trim()) {
          names.add(reference.variableName.trim());
        }
      }
    }
  }

  return names;
}

function isBalanceSheetMatrix(cell: MatrixCell): boolean {
  if (cell.accountingKind === "balance-sheet") {
    return true;
  }

  const title = cell.title.trim().toLowerCase();
  const id = cell.id.trim().toLowerCase();
  return title.includes("balance sheet") || id.includes("balance-sheet") || id === "balance-sheet";
}
