import { isInitialValueEnabled } from "@sfcr/notebook-core";

export function summarizeInitialValueEnableState<T extends { enabled?: boolean }>(
  rows: readonly T[]
): { allEnabled: boolean; someEnabled: boolean } {
  if (rows.length === 0) {
    return { allEnabled: false, someEnabled: false };
  }

  return {
    allEnabled: rows.every((row) => isInitialValueEnabled(row)),
    someEnabled: rows.some((row) => isInitialValueEnabled(row))
  };
}

export function withInitialValueEnabled<T extends { enabled?: boolean }>(
  row: T,
  enabled: boolean
): T {
  return enabled ? { ...row, enabled: undefined } : { ...row, enabled: false };
}
