import type { SectorTopology } from "@sfcr/core";

import type { DisplayNode } from "./dependencyGraphLayoutTypes";

export function resolveDisplaySector(
  node: Pick<DisplayNode, "name" | "canonicalName" | "mirrorSector">,
  sectorTopology: SectorTopology
): string {
  if (node.mirrorSector) {
    return node.mirrorSector;
  }
  const canonicalName = node.canonicalName ?? node.name;
  return sectorTopology.variables[canonicalName]?.sector ?? sectorTopology.variables[node.name]?.sector ?? "Unmapped";
}
