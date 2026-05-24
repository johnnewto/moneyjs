import type { MatrixCell, NotebookCell } from "./types";
import { buildNormalizedMatrixReferenceLabel } from "./matrixExpressionNormalization";

const IGNORED_TOKENS = new Set(["d", "dt", "max", "min", "abs", "sqrt", "log", "exp", "pow"]);

export interface DerivedAccountingTerm {
  id: string;
  canonicalVariable: string;
  band: string;
  label: string;
  fullExpression: string;
  proxyKind: "stock" | "change" | "interest" | "row-expression";
  source: "transaction-row" | "balance-row";
  references: Array<{ name: string; current: boolean; lagged: boolean }>;
}

export function buildDerivedAccountingTermsFromCells(cells: NotebookCell[]): DerivedAccountingTerm[] {
  const terms = new Map<string, DerivedAccountingTerm>();

  cells.forEach((cell) => {
    if (cell.type !== "matrix") {
      return;
    }

    const source = inferDerivedTermSource(cell.title);
    cell.rows.forEach((row) => {
      const band = resolveOriginalBand(row);
      if (!band) {
        return;
      }

      row.values.forEach((value, valueIndex) => {
        const expression = value.trim();
        if (!expression) {
          return;
        }

        const references = extractDependencyExpressionReferences(expression);
        references.forEach((reference) => {
          const proxyKind = classifyProxyKind(reference.name, band, expression);
          const label = buildAccountingReferenceLabel(reference.name, expression, proxyKind);
          const id = `derived:${cell.id}:${row.label}:${valueIndex}:${reference.name}`;
          terms.set(id, {
            id,
            canonicalVariable: reference.name,
            band,
            label,
            fullExpression: expression,
            proxyKind,
            source,
            references
          });
        });
      });
    });
  });

  return Array.from(terms.values());
}

function extractDependencyExpressionReferences(
  source: string
): Array<{ name: string; current: boolean; lagged: boolean }> {
  return extractVariableNames(source).map((name) => ({
    name,
    current: hasCurrentDependencyReference(source, name),
    lagged: hasLaggedDependencyReference(source, name)
  }));
}

function extractVariableNames(source: string): string[] {
  const tokens = source.match(/[A-Za-z_][A-Za-z0-9_.^{}]*/g) ?? [];
  return Array.from(
    new Set(tokens.filter((token) => !IGNORED_TOKENS.has(token.toLowerCase())))
  );
}

function hasLaggedDependencyReference(source: string, variable: string): boolean {
  const escaped = escapeRegExp(variable);
  return new RegExp(`lag\\s*\\(\\s*${escaped}\\s*\\)|\\b${escaped}\\s*\\[-1\\]`, "i").test(source);
}

function hasCurrentDependencyReference(source: string, variable: string): boolean {
  const escaped = escapeRegExp(variable);
  const withoutLaggedReferences = source.replace(
    new RegExp(`lag\\s*\\(\\s*${escaped}\\s*\\)|\\b${escaped}\\s*\\[-1\\]`, "ig"),
    " "
  );
  return new RegExp(`\\b${escaped}\\b`).test(withoutLaggedReferences);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function resolveOriginalBand(row: MatrixCell["rows"][number]): string | null {
  if (row.band !== undefined) {
    return normalizeBandLabel(row.band) || "Unmapped";
  }
  return normalizeBandLabel(row.label) || null;
}

function normalizeBandLabel(label: string): string {
  const trimmed = label.trim();
  const lower = trimmed.toLowerCase();
  if (!trimmed || lower === "sum" || lower === "total") {
    return "";
  }
  return trimmed.replace(/\s+/g, " ");
}

function buildAccountingReferenceLabel(
  variable: string,
  expression: string,
  _proxyKind: "stock" | "change" | "interest" | "row-expression" = "row-expression"
): string {
  return buildNormalizedMatrixReferenceLabel(variable, expression);
}

function inferDerivedTermSource(title: string): "transaction-row" | "balance-row" {
  return /balance/i.test(title) ? "balance-row" : "transaction-row";
}

function classifyProxyKind(
  variable: string,
  band: string,
  expression: string
): "stock" | "change" | "interest" | "row-expression" {
  const compact = expression.replace(/\s+/g, "").toLowerCase();
  if (compact.includes(`d(${variable.toLowerCase()})`) || /(^|[^a-z])(ch\.?|change)\b/i.test(band)) {
    return "change";
  }
  if (/(^|[^a-z])(int\.?|interest)\b/i.test(band) || /\brm|\brl|\brb/.test(compact)) {
    return "interest";
  }
  if (band.toLowerCase().includes("deposit") || band.toLowerCase().includes("loan") || band.toLowerCase().includes("capital")) {
    return "stock";
  }
  return "row-expression";
}
