const LAG_SUFFIX_PATTERN = /\b([A-Za-z_][A-Za-z0-9_]*)_lag\b/g;

/** Map pedagogical `K_lag` identifiers to `lag(K)` before CLD parsing. */
export function normalizeCldEquationSource(source: string): string {
  return source.replace(LAG_SUFFIX_PATTERN, "lag($1)");
}
