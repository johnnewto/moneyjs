import type { MatrixCell, NotebookCell, SequenceCell } from "./types";
import type { ParsedDependencyGraph } from "./dependencyGraph";
import type {
  DependencySectorDisplayOccurrences,
  DependencyStripSectorSourceMode
} from "./dependencySectors";
import { resolveMatrixStripSector, resolveStripMappingSources } from "./dependencySectors";
import { buildNormalizedMatrixReferenceLabel } from "./matrixExpressionNormalization";

const IGNORED_TOKENS = new Set(["d", "dt", "max", "min", "abs", "sqrt", "log", "exp"]);
const EXOGENOUS_BAND = "Exogenous";
const UNMAPPED_BAND = "Unmapped";

export type DependencyRowMembershipSource =
  | "transaction-row"
  | "balance-row"
  | "explicit"
  | "inferred"
  | "fallback";

export type DependencyRowMembershipConfidence = "high" | "medium" | "low" | "fallback";

export interface DependencyRowMembership {
  band: string;
  originalBand?: string;
  weight: number;
  source: DependencyRowMembershipSource;
  confidence: DependencyRowMembershipConfidence;
  expression?: string;
  proxyLabel?: string;
  proxyKind?: "stock" | "change" | "interest" | "row-expression";
}

export interface DependencyRowAssignment {
  primaryBand: string;
  memberships: DependencyRowMembership[];
  proxyMemberships?: DependencyRowMembership[];
}

export interface DependencyRowTopology {
  bands: string[];
  variables: Record<string, DependencyRowAssignment | undefined>;
}

interface MutableMembership extends DependencyRowMembership {
  explicit: boolean;
}

export interface AccountingProxyNode {
  id: string;
  canonicalVariable: string;
  band: string;
  label: string;
  fullExpression: string;
  proxyKind: "stock" | "change" | "interest" | "row-expression";
  source: "transaction-row" | "balance-row";
}

export interface DerivedAccountingTerm extends AccountingProxyNode {
  references: Array<{ name: string; current: boolean; lagged: boolean }>;
}

interface DirectedAdjacency {
  incoming: Map<string, Array<{ id: string; weight: number }>>;
  outgoing: Map<string, Array<{ id: string; weight: number }>>;
}

export function buildDependencyRowTopology(args: {
  cells: NotebookCell[];
  dependencyCell: SequenceCell & {
    source: Extract<SequenceCell["source"], { kind: "dependency" }>;
  };
  graph: ParsedDependencyGraph;
}): DependencyRowTopology {
  const sources = resolveStripMappingSources(args.cells, args.dependencyCell);
  const bandOrder: string[] = [];
  const bandOrderSet = new Set<string>();
  const membershipsByVariable = new Map<string, Map<string, MutableMembership>>();
  const matrixRows = [
    ...(sources.transactionMatrix?.rows ?? []),
    ...(sources.balanceMatrix?.rows ?? [])
  ];

  const pushBand = (band: string): void => {
    if (!band || bandOrderSet.has(band)) {
      return;
    }
    bandOrderSet.add(band);
    bandOrder.push(band);
  };

  const addMembership = (
    variable: string,
    membership: Omit<MutableMembership, "explicit"> & { explicit?: boolean }
  ): void => {
    const byBand = membershipsByVariable.get(variable) ?? new Map<string, MutableMembership>();
    membershipsByVariable.set(variable, byBand);
    const membershipKey = buildMembershipKey(membership);
    const previous = byBand.get(membershipKey);
    const next: MutableMembership = {
      band: membership.band,
      originalBand: membership.originalBand,
      weight: membership.weight,
      source: membership.source,
      confidence: membership.confidence,
      explicit: membership.explicit ?? false,
      expression: membership.expression,
      proxyLabel: membership.proxyLabel,
      proxyKind: membership.proxyKind
    };
    if (!previous) {
      byBand.set(membershipKey, next);
      return;
    }

    byBand.set(membershipKey, {
      band: membership.band,
      originalBand: previous.originalBand ?? next.originalBand,
      weight: Math.max(previous.weight, next.weight),
      source: choosePreferredSource(previous.source, next.source),
      confidence: choosePreferredConfidence(previous.confidence, next.confidence),
      explicit: previous.explicit || next.explicit,
      expression: previous.expression ?? next.expression,
      proxyLabel: previous.proxyLabel ?? next.proxyLabel,
      proxyKind: previous.proxyKind ?? next.proxyKind
    });
  };

  const applyMatrixRows = (
    rows: MatrixCell["rows"],
    source: "transaction-row" | "balance-row"
  ): void => {
    rows.forEach((row) => {
      const originalBand = resolveOriginalBand(row);
      if (!originalBand) {
        return;
      }
      const band = originalBand;
      pushBand(band);
      row.values.forEach((value) => {
        extractVariableNames(value).forEach((variable) => {
          const proxyKind = classifyProxyKind(variable, originalBand, value);
          addMembership(variable, {
            band,
            originalBand,
            weight: 1,
            source,
            confidence: "high",
            explicit: true,
            expression: value.trim(),
            proxyLabel: buildCompactProxyLabel(variable, value, proxyKind),
            proxyKind
          });
        });
      });
    });
  };

  if (sources.transactionMatrix) {
    applyMatrixRows(sources.transactionMatrix.rows, "transaction-row");
  }
  if (sources.balanceMatrix) {
    applyMatrixRows(sources.balanceMatrix.rows, "balance-row");
  }

  args.graph.nodes
    .filter((node) => node.variableType === "exogenous")
    .forEach((node) => {
      pushBand(EXOGENOUS_BAND);
      addMembership(node.name, {
        band: EXOGENOUS_BAND,
        weight: 1,
        source: "explicit",
        confidence: "high",
        explicit: true
      });
    });

  const explicitMembershipsByNode = new Map<string, DependencyRowMembership[]>();
  membershipsByVariable.forEach((byBand, variable) => {
    explicitMembershipsByNode.set(
      variable,
      Array.from(byBand.values())
        .filter((membership) => membership.explicit)
        .map(stripExplicitFlag)
    );
  });

  const adjacency = buildAdjacency(args.graph);
  args.graph.nodes
    .filter((node) => node.variableType !== "exogenous")
    .forEach((node) => {
      const existing = membershipsByVariable.get(node.name);
      const explicitCount = existing ? Array.from(existing.values()).filter((value) => value.explicit).length : 0;
      if (explicitCount > 0) {
        return;
      }

      const inferred = inferMemberships(node.id, adjacency, explicitMembershipsByNode);
      if (inferred.length === 0) {
        return;
      }

      inferred.forEach((membership) => {
        pushBand(membership.band);
        addMembership(node.name, membership);
      });
    });

  const variables: DependencyRowTopology["variables"] = {};
  const usedBands = new Set<string>();

  args.graph.nodes.forEach((node) => {
    const allMemberships = Array.from(membershipsByVariable.get(node.name)?.values() ?? [])
      .map(stripExplicitFlag)
      .sort((left, right) => compareMemberships(left, right, bandOrder));
    const memberships = allMemberships.filter((membership) => isCanonicalMembership(membership, node.name));
    const proxyMemberships = allMemberships.filter((membership) => !isCanonicalMembership(membership, node.name));
    if (memberships.length === 0) {
      variables[node.name] = {
        primaryBand: UNMAPPED_BAND,
        memberships: [
          {
            band: UNMAPPED_BAND,
            weight: 1,
            source: "fallback",
            confidence: "fallback"
          }
        ],
        proxyMemberships
      };
      usedBands.add(UNMAPPED_BAND);
      proxyMemberships.forEach((membership) => usedBands.add(membership.band));
      return;
    }

    variables[node.name] = {
      primaryBand: memberships[0]?.band ?? UNMAPPED_BAND,
      memberships,
      proxyMemberships
    };
    memberships.forEach((membership) => usedBands.add(membership.band));
    proxyMemberships.forEach((membership) => usedBands.add(membership.band));
  });

  const orderedBands = bandOrder.filter((band) => usedBands.has(band));
  if (usedBands.has(EXOGENOUS_BAND) && !orderedBands.includes(EXOGENOUS_BAND)) {
    orderedBands.push(EXOGENOUS_BAND);
  }

  return {
    bands: orderedBands,
    variables
  };
}

function buildAdjacency(graph: ParsedDependencyGraph): DirectedAdjacency {
  const incoming = new Map<string, Array<{ id: string; weight: number }>>();
  const outgoing = new Map<string, Array<{ id: string; weight: number }>>();

  graph.nodes.forEach((node) => {
    incoming.set(node.id, []);
    outgoing.set(node.id, []);
  });
  graph.edges.forEach((edge) => {
    const weight = edge.current ? (edge.lagged ? 1.4 : 2) : 0.75;
    outgoing.get(edge.sourceId)?.push({ id: edge.targetId, weight });
    incoming.get(edge.targetId)?.push({ id: edge.sourceId, weight });
  });

  return { incoming, outgoing };
}

function inferMemberships(
  nodeId: string,
  adjacency: DirectedAdjacency,
  explicitMembershipsByNode: Map<string, DependencyRowMembership[]>
): Array<Omit<MutableMembership, "explicit"> & { explicit?: boolean }> {
  const scores = new Map<string, number>();

  const neighborPool =
    (adjacency.incoming.get(nodeId) ?? []).length > 0
      ? adjacency.incoming.get(nodeId) ?? []
      : adjacency.outgoing.get(nodeId) ?? [];

  neighborPool.forEach((neighbor) => {
    const memberships = explicitMembershipsByNode.get(neighbor.id) ?? [];
    memberships.forEach((membership) => {
      const score =
        (scores.get(membership.band) ?? 0) +
        (neighbor.weight * membership.weight) / Math.max(1, memberships.length);
      scores.set(membership.band, score);
    });
  });

  const ranked = Array.from(scores.entries())
    .sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }
      return left[0].localeCompare(right[0]);
    })
    .slice(0, 2);

  if (ranked.length === 0) {
    return [];
  }

  const strongest = ranked[0]?.[1] ?? 0;
  return ranked
    .filter(([, score], index) => (index === 0 ? score >= 1.5 : score >= 1))
    .map(([band, score], index) => ({
      band,
      weight: strongest > 0 ? Math.max(0.35, Math.min(0.85, score / strongest)) : 0.35,
      source: "inferred",
      confidence: index === 0 && score >= 2 ? "medium" : "low"
    }));
}

function buildMembershipKey(
  membership: Pick<MutableMembership, "band" | "originalBand" | "source">
): string {
  if (membership.originalBand) {
    return `${membership.source}:${membership.originalBand}`;
  }
  return `band:${membership.band}`;
}

function resolveOriginalBand(row: MatrixCell["rows"][number]): string | null {
  if (row.band !== undefined) {
    return normalizeBandLabel(row.band) || UNMAPPED_BAND;
  }
  if (row.Band !== undefined) {
    return normalizeBandLabel(row.Band) || UNMAPPED_BAND;
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

export function extractDependencyExpressionReferences(
  source: string
): Array<{ name: string; current: boolean; lagged: boolean }> {
  return extractVariableNames(source).map((name) => ({
    name,
    current: hasCurrentDependencyReference(source, name),
    lagged: hasLaggedDependencyReference(source, name)
  }));
}

function extractVariableNames(source: string): string[] {
  const tokens = source.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [];
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

function choosePreferredSource(
  left: DependencyRowMembershipSource,
  right: DependencyRowMembershipSource
): DependencyRowMembershipSource {
  const rank: Record<DependencyRowMembershipSource, number> = {
    explicit: 4,
    "transaction-row": 3,
    "balance-row": 3,
    inferred: 2,
    fallback: 1
  };
  return rank[right] > rank[left] ? right : left;
}

function choosePreferredConfidence(
  left: DependencyRowMembershipConfidence,
  right: DependencyRowMembershipConfidence
): DependencyRowMembershipConfidence {
  const rank: Record<DependencyRowMembershipConfidence, number> = {
    high: 4,
    medium: 3,
    low: 2,
    fallback: 1
  };
  return rank[right] > rank[left] ? right : left;
}

function stripExplicitFlag(membership: MutableMembership): DependencyRowMembership {
  return {
    band: membership.band,
    originalBand: membership.originalBand,
    weight: membership.weight,
    source: membership.source,
    confidence: membership.confidence,
    expression: membership.expression,
    proxyLabel: membership.proxyLabel,
    proxyKind: membership.proxyKind
  };
}

function compareMemberships(
  left: DependencyRowMembership,
  right: DependencyRowMembership,
  bandOrder: string[]
): number {
  if (right.weight !== left.weight) {
    return right.weight - left.weight;
  }
  const leftIndex = bandOrder.indexOf(left.band);
  const rightIndex = bandOrder.indexOf(right.band);
  if (leftIndex !== rightIndex) {
    return (leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex) - (rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex);
  }
  if ((left.originalBand ?? left.band) !== (right.originalBand ?? right.band)) {
    return (left.originalBand ?? left.band).localeCompare(right.originalBand ?? right.band);
  }
  return left.band.localeCompare(right.band);
}

function isCanonicalMembership(membership: DependencyRowMembership, variable: string): boolean {
  if (!membership.proxyLabel) {
    return true;
  }
  return membership.proxyLabel === variable;
}

export function buildAccountingProxyNodes(rowTopology: DependencyRowTopology): AccountingProxyNode[] {
  return buildDerivedAccountingTerms(rowTopology).map(({ references: _references, ...proxy }) => proxy);
}

export function buildDerivedAccountingTerms(rowTopology: DependencyRowTopology): DerivedAccountingTerm[] {
  const terms: DerivedAccountingTerm[] = [];

  Object.entries(rowTopology.variables).forEach(([variable, assignment]) => {
    if (!assignment) {
      return;
    }
    const explicitMemberships = [...assignment.memberships, ...(assignment.proxyMemberships ?? [])].filter(
      (membership) =>
        (membership.source === "transaction-row" || membership.source === "balance-row") &&
        membership.expression &&
        membership.proxyLabel
    );
    const distinctKinds = new Set(
      explicitMemberships.map((membership) => membership.proxyKind ?? "row-expression")
    );
    if (explicitMemberships.length < 2 || distinctKinds.size < 2) {
      return;
    }

    explicitMemberships.forEach((membership) => {
      const source = membership.source === "balance-row" ? "balance-row" : "transaction-row";
      terms.push({
        id: `proxy:${variable}:${membership.originalBand ?? membership.band}`,
        canonicalVariable: variable,
        band: membership.band,
        label: membership.proxyLabel ?? variable,
        fullExpression: membership.expression ?? variable,
        proxyKind: membership.proxyKind ?? "row-expression",
        source,
        references: extractDependencyExpressionReferences(membership.expression ?? variable)
      });
    });
  });

  return terms;
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

export function buildDependencyProxyDisplayOccurrences(
  cells: NotebookCell[],
  stripSectorSource?: DependencyStripSectorSourceMode
): DependencySectorDisplayOccurrences {
  const occurrencesByVariable = new Map<string, Array<{
    displayLabel: string;
    kind: "proxy";
    sector: string;
    sign: "+" | "-" | "neutral";
    sourceCellKey: string;
    sourceExpression: string;
    sourceRowLabel: string;
    variable: string;
  }>>();
  const seenByVariable = new Map<string, Set<string>>();
  const rawOccurrences: Array<{
    displayLabel: string;
    kind: "proxy";
    sector: string;
    sign: "+" | "-" | "neutral";
    sourceCellKey: string;
    sourceExpression: string;
    sourceRowLabel: string;
    variable: string;
  }> = [];

  cells.forEach((cell) => {
    if (cell.type !== "matrix") {
      return;
    }

    cell.rows.forEach((row) => {
      const band = resolveOriginalBand(row);
      if (!band) {
        return;
      }

      row.values.forEach((value, columnIndex) => {
        const expression = value.trim();
        if (!expression) {
          return;
        }

        const sector = normalizeMatrixOccurrenceSector(cell, columnIndex, stripSectorSource);
        if (!sector) {
          return;
        }

        const sign = inferDisplayOccurrenceSign(expression);
        const references = extractDependencyExpressionReferences(expression);
        references.forEach((reference) => {
          const proxyKind = classifyProxyKind(reference.name, band, expression);
          const displayLabel = buildAccountingReferenceLabel(reference.name, expression, proxyKind);
          if (displayLabel === reference.name) {
            return;
          }

          const occurrence = {
            displayLabel,
            kind: "proxy" as const,
            sector,
            sign,
            sourceCellKey: `${cell.id}:${row.label}:${sector}:${expression}`,
            sourceExpression: expression,
            sourceRowLabel: row.label,
            variable: reference.name
          };
          rawOccurrences.push(occurrence);
        });
      });
    });
  });

  rawOccurrences.forEach((entry) => {
    const bucket = occurrencesByVariable.get(entry.variable) ?? [];
    const seen = seenByVariable.get(entry.variable) ?? new Set<string>();
    const occurrenceKey = `${entry.displayLabel}::${entry.sector}::${entry.sign}`;
    if (!seen.has(occurrenceKey)) {
      bucket.push(entry);
      occurrencesByVariable.set(entry.variable, bucket);
      seen.add(occurrenceKey);
      seenByVariable.set(entry.variable, seen);
    }
  });

  return Object.fromEntries(occurrencesByVariable.entries());
}

export function buildCompactProxyLabel(
  variable: string,
  expression: string,
  _proxyKind: "stock" | "change" | "interest" | "row-expression" = "row-expression"
): string {
  const label = buildNormalizedMatrixReferenceLabel(variable, expression);
  return label === variable ? variable : label;
}

export function buildAccountingReferenceLabel(
  variable: string,
  expression: string,
  _proxyKind: "stock" | "change" | "interest" | "row-expression" = "row-expression"
): string {
  return buildNormalizedMatrixReferenceLabel(variable, expression);
}

function inferDerivedTermSource(title: string): "transaction-row" | "balance-row" {
  return /balance/i.test(title) ? "balance-row" : "transaction-row";
}

function inferDisplayOccurrenceSign(expression: string): "+" | "-" | "neutral" {
  const trimmed = expression.trim();
  if (trimmed.startsWith("+")) {
    return "+";
  }
  if (trimmed.startsWith("-")) {
    return "-";
  }
  return "neutral";
}

function normalizeMatrixOccurrenceSector(
  cell: Extract<NotebookCell, { type: "matrix" }>,
  columnIndex: number,
  stripSectorSource?: DependencyStripSectorSourceMode
): string {
  return resolveMatrixStripSector(cell, columnIndex, stripSectorSource);
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
