import type { ExternalRow } from "./editorModel";
import type { EditorState } from "./editorModel";
import type { CatalogModelContext } from "./variableCatalog";

export type ConstantExternalOverrides = Record<string, Record<string, number>>;

export interface ConstantParameterEntry {
  modelId: string;
  modelTitle: string;
  external: ExternalRow;
  baselineValue: number;
}

export interface SliderRange {
  min: number;
  max: number;
  step: number;
}

export function parseConstantBaselineValue(valueText: string): number | null {
  const parsed = Number(valueText.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

export function resolveEffectiveConstantValue(
  baseline: number,
  override: number | undefined
): number {
  return override !== undefined && Number.isFinite(override) ? override : baseline;
}

export function heuristicSliderRange(baseline: number): SliderRange {
  if (!Number.isFinite(baseline)) {
    return { min: 0, max: 1, step: 0.01 };
  }

  if (baseline === 0 || Math.abs(baseline) <= 1) {
    return { min: 0, max: 1, step: 0.01 };
  }

  const min = baseline * 0.5;
  const max = baseline * 1.5;
  const span = max - min;
  const step = niceStep(span / 100);

  return { min, max, step };
}

export function applyConstantExternalOverrides(
  editor: EditorState,
  overrides: Record<string, number>
): EditorState {
  if (Object.keys(overrides).length === 0) {
    return editor;
  }

  return {
    ...editor,
    externals: editor.externals.map((external) => {
      if (external.kind !== "constant") {
        return external;
      }

      const name = external.name.trim();
      const override = overrides[name];
      if (override === undefined || !Number.isFinite(override)) {
        return external;
      }

      return {
        ...external,
        valueText: String(override)
      };
    })
  };
}

export function listConstantParameterEntries(
  contexts: CatalogModelContext[]
): ConstantParameterEntry[] {
  const entries: ConstantParameterEntry[] = [];

  for (const context of contexts) {
    for (const external of context.editor.externals) {
      if (external.kind !== "constant") {
        continue;
      }

      const name = external.name.trim();
      if (!name) {
        continue;
      }

      const baselineValue = parseConstantBaselineValue(external.valueText);
      if (baselineValue == null) {
        continue;
      }

      entries.push({
        modelId: context.modelId,
        modelTitle: context.modelTitle,
        external,
        baselineValue
      });
    }
  }

  return entries.sort((left, right) => {
    const modelCompare = left.modelTitle.localeCompare(right.modelTitle);
    if (modelCompare !== 0) {
      return modelCompare;
    }
    return left.external.name.localeCompare(right.external.name);
  });
}

export function hasParameterOverrides(overrides: ConstantExternalOverrides): boolean {
  return Object.values(overrides).some((modelOverrides) => Object.keys(modelOverrides).length > 0);
}

export function countSeriesExternals(contexts: CatalogModelContext[]): number {
  return contexts.reduce(
    (count, context) =>
      count + context.editor.externals.filter((external) => external.kind === "series").length,
    0
  );
}

export function resolveModelOverrides(
  overrides: ConstantExternalOverrides,
  modelId: string
): Record<string, number> {
  return overrides[modelId] ?? {};
}

function niceStep(rawStep: number): number {
  if (!Number.isFinite(rawStep) || rawStep <= 0) {
    return 0.01;
  }

  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;

  if (normalized <= 1) {
    return magnitude;
  }
  if (normalized <= 2) {
    return 2 * magnitude;
  }
  if (normalized <= 5) {
    return 5 * magnitude;
  }
  return 10 * magnitude;
}
