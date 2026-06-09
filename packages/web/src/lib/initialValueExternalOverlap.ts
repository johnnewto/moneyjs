import {
  externalRowsOnly,
  isRowComment,
  type ExternalListItem,
  type InitialValueListItem
} from "@sfcr/notebook-core";

export interface InitialValueExternalOverlapEntry {
  name: string;
  externalKind: string;
  initialValueText: string;
  initialValueEnabled: boolean;
}

export interface InitialValueExternalOverlapSummary {
  overlaps: InitialValueExternalOverlapEntry[];
}

export function buildInitialValueExternalOverlapSummary(
  initialValues: InitialValueListItem[],
  externals: ExternalListItem[]
): InitialValueExternalOverlapSummary {
  const externalByName = new Map<string, { kind: string }>();
  for (const external of externalRowsOnly(externals)) {
    const name = external.name.trim();
    if (!name) {
      continue;
    }
    externalByName.set(name, { kind: external.kind });
  }

  const overlaps: InitialValueExternalOverlapEntry[] = [];
  for (const row of initialValues) {
    if (isRowComment(row)) {
      continue;
    }
    const name = row.name.trim();
    if (!name) {
      continue;
    }
    const external = externalByName.get(name);
    if (!external) {
      continue;
    }
    overlaps.push({
      name,
      externalKind: external.kind,
      initialValueText: row.valueText.trim(),
      initialValueEnabled: row.enabled !== false
    });
  }

  overlaps.sort((left, right) => left.name.localeCompare(right.name));
  return { overlaps };
}

export function removeInitialValuesOverlappingExternals(
  initialValues: InitialValueListItem[],
  externals: ExternalListItem[]
): InitialValueListItem[] {
  const overlapNames = new Set(
    buildInitialValueExternalOverlapSummary(initialValues, externals).overlaps.map(
      (overlap) => overlap.name
    )
  );
  if (overlapNames.size === 0) {
    return initialValues;
  }

  return initialValues.filter((row) => {
    if (isRowComment(row)) {
      return true;
    }
    const name = row.name.trim();
    return !name || !overlapNames.has(name);
  });
}

export function formatInitialValueExternalOverlapRemovalMessage(
  summary: InitialValueExternalOverlapSummary
): string {
  const count = summary.overlaps.length;
  if (count === 0) {
    return "No overlapping initial value rows were removed.";
  }
  const names = summary.overlaps.map((overlap) => overlap.name).join(", ");
  return `Removed ${count} initial value ${count === 1 ? "row" : "rows"} that overlapped externals: ${names}.`;
}
