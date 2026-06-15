/** Accounting matrix cells that carry no evaluable expression. */
export function isSkippableMatrixCellSource(source: string): boolean {
  const trimmed = source.trim();
  return !trimmed || trimmed === "0" || trimmed === "-" || trimmed === "+";
}
