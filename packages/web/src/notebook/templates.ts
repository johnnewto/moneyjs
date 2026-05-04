import bmwNotebookJson from "./templates/bmw.notebook.json";
import gl2PcNotebookJson from "./templates/gl2-pc.notebook.json";
import gl6DisNotebookJson from "./templates/gl6-dis.notebook.json";
import gl6DisRentierNotebookJson from "./templates/gl6-dis-rentier.notebook.json";
import gl6DisRentierV2NotebookJson from "./templates/gl6-dis-rentier.notebook.v2.json";
import gl7InsoutNotebookJson from "./templates/gl7-insout.notebook.json";
import gl8GrowthNotebookJson from "./templates/gl8-growth.notebook.json";
import opensimplestLevyNotebookJson from "./templates/opensimplest-levy.notebook.json";
import opensimplestNotebookJson from "./templates/opensimplest.notebook.json";
import predatorPreyNotebookJson from "./templates/predator-prey.notebook.json";
import simpleEpidemicNotebookJson from "./templates/simple-epidemic.notebook.json";
import solverOverviewNotebookJson from "./templates/solver-overview.notebook.json";
import { notebookFromJson } from "./document";
import type { NotebookDocument } from "./types";

export type NotebookTemplateId =
  | "bmw"
  | "gl2-pc"
  | "gl6-dis"
  | "gl6-dis-rentier"
  | "gl6-dis-rentier-v2"
  | "gl7-insout"
  | "gl8-growth"
  | "opensimplest-levy"
  | "opensimplest"
  | "predator-prey"
  | "simple-epidemic"
  | "solver-overview";
export const DEFAULT_NOTEBOOK_TEMPLATE_ID: NotebookTemplateId = "bmw";

export interface NotebookTemplateDefinition {
  id: NotebookTemplateId;
  label: string;
  description: string;
  document: NotebookDocument;
}

export const NOTEBOOK_TEMPLATES: Record<NotebookTemplateId, NotebookTemplateDefinition> = {
  bmw: {
    id: "bmw",
    label: "BMW",
    description: "BMW browser notebook with a baseline run, two scenarios, and accounting views.",
    document: notebookFromJson(JSON.stringify(bmwNotebookJson))
  },
  "gl2-pc": {
    id: "gl2-pc",
    label: "GL2 PC",
    description:
      "PC notebook based on the gl2-pc article baseline, balance-sheet views, and two deterministic extensions.",
    document: notebookFromJson(JSON.stringify(gl2PcNotebookJson))
  },
  "gl6-dis": {
    id: "gl6-dis",
    label: "GL6 DIS",
    description: "DIS notebook based on the gl6-dis article baseline, matrices, and two scenarios.",
    document: notebookFromJson(JSON.stringify(gl6DisNotebookJson))
  },
  "gl6-dis-rentier": {
    id: "gl6-dis-rentier",
    label: "GL6 DIS Rentier",
    description:
      "Two-household DIS notebook with workers, rentiers, taxes, and a money-versus-bonds portfolio split.",
    document: notebookFromJson(JSON.stringify(gl6DisRentierNotebookJson))
  },
  "gl6-dis-rentier-v2": {
    id: "gl6-dis-rentier-v2",
    label: "GL6 DIS Rentier v2",
    description: "Separate v2 notebook entry for the DIS rentier template.",
    document: notebookFromJson(JSON.stringify(gl6DisRentierV2NotebookJson))
  },
  "gl7-insout": {
    id: "gl7-insout",
    label: "GL7 INSOUT",
    description:
      "INSOUT notebook based on the gl7-insout article baseline, matrices, and selected scenario experiments.",
    document: notebookFromJson(JSON.stringify(gl7InsoutNotebookJson))
  },
  "gl8-growth": {
    id: "gl8-growth",
    label: "GL8 GROWTH",
    description:
      "GROWTH notebook based on the gl8-growth article baseline, accounting matrices, and selected policy experiments.",
    document: notebookFromJson(JSON.stringify(gl8GrowthNotebookJson))
  },
  opensimplest: {
    id: "opensimplest",
    label: "OPENSIMPLEST",
    description:
      "Compact open-economy SFC notebook with four sectors, portfolio allocation, exchange-rate adjustment, and an export-shock scenario.",
    document: notebookFromJson(JSON.stringify(opensimplestNotebookJson))
  },
  "opensimplest-levy": {
    id: "opensimplest-levy",
    label: "OPENSIMPLEST Levy",
    description:
      "Levy WP 1105 aligned OPENSIMPLEST notebook using paper-style superscript symbols, lagged interest-rate flows, and a 150-period baseline.",
    document: notebookFromJson(JSON.stringify(opensimplestLevyNotebookJson))
  },
  "predator-prey": {
    id: "predator-prey",
    label: "Predator-prey",
    description:
      "Minimal reference notebook with lagged predator-prey dynamics, one baseline run, and one scenario shock.",
    document: notebookFromJson(JSON.stringify(predatorPreyNotebookJson))
  },
  "simple-epidemic": {
    id: "simple-epidemic",
    label: "Simple epidemic",
    description:
      "Runnable version of the legacy simple epidemic model with stock equations, a contact lookup approximation, and a baseline chart.",
    document: notebookFromJson(JSON.stringify(simpleEpidemicNotebookJson))
  },
  "solver-overview": {
    id: "solver-overview",
    label: "Solver overview",
    description:
      "Runnable version of the solver overview block-ordering example with one acyclic chain, one cyclic block, and one scenario.",
    document: notebookFromJson(JSON.stringify(solverOverviewNotebookJson))
  }
};

export function createNotebookFromTemplate(
  id: NotebookTemplateId = DEFAULT_NOTEBOOK_TEMPLATE_ID
): NotebookDocument {
  return structuredClone(NOTEBOOK_TEMPLATES[id].document);
}

export function isNotebookTemplateId(value: string): value is NotebookTemplateId {
  return value in NOTEBOOK_TEMPLATES;
}
