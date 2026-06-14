import { buildVariableDescriptions } from "../src/lib/variableDescriptions";
import { buildVariableUnitMetadata } from "../src/lib/units";
import type { PublicationVariableInteraction } from "../src/publication/publicationInspect";

export function createTestPublicationInteraction(
  overrides: Partial<PublicationVariableInteraction> = {}
): PublicationVariableInteraction {
  return {
    currentValues: {},
    highlightedVariable: null,
    parameterNames: new Set(),
    variableDescriptions: buildVariableDescriptions({}),
    variableUnitMetadata: buildVariableUnitMetadata({}),
    ...overrides
  };
}
