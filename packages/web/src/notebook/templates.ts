import bmwNotebookYaml from "./templates/bmw.notebook.yaml?raw";
import gl2PcNotebookYaml from "./templates/gl2-pc.notebook.yaml?raw";
import gl6DisNotebookYaml from "./templates/gl6-dis.notebook.yaml?raw";
import gl6DisRentierNotebookYaml from "./templates/gl6-dis-rentier.notebook.yaml?raw";
import gl6DisRentierV2NotebookYaml from "./templates/gl6-dis-rentier-v2.notebook.yaml?raw";
import gl7InsoutNotebookYaml from "./templates/gl7-insout.notebook.yaml?raw";
import gl8GrowthNotebookYaml from "./templates/gl8-growth.notebook.yaml?raw";
import interbankLiquidityRiskNotebookYaml from "./templates/interbank-liquidity-risk.notebook.yaml?raw";
import opensimplestLevyNotebookYaml from "./templates/opensimplest-levy.notebook.yaml?raw";
import opensimplestNotebookYaml from "./templates/opensimplest.notebook.yaml?raw";
import predatorPreyNotebookYaml from "./templates/predator-prey.notebook.yaml?raw";
import simpleEpidemicNotebookYaml from "./templates/simple-epidemic.notebook.yaml?raw";
import simNotebookYaml from "./templates/sim.notebook.yaml?raw";
import solverOverviewNotebookYaml from "./templates/solver-overview.notebook.yaml?raw";
import { notebookFromYaml } from "./document";
import type { NotebookDocument } from "./types";

export type NotebookTemplateId =
  | "bmw"
  | "gl2-pc"
  | "gl6-dis"
  | "gl6-dis-rentier"
  | "gl6-dis-rentier-v2"
  | "gl7-insout"
  | "gl8-growth"
  | "interbank-liquidity-risk"
  | "opensimplest-levy"
  | "opensimplest"
  | "predator-prey"
  | "simple-epidemic"
  | "sim"
  | "solver-overview";
export const DEFAULT_NOTEBOOK_TEMPLATE_ID: NotebookTemplateId = "bmw";

export interface NotebookTemplateDefinition {
  id: NotebookTemplateId;
  label: string;
  description: string;
  document: NotebookDocument;
}

export const NOTEBOOK_TEMPLATES: Record<NotebookTemplateId, NotebookTemplateDefinition> = {
  sim: {
    id: "sim",
    label: "SIM",
    description:
      "Godley-Lavoie SIM notebook with baseline, government-spending scenario, accounting matrices, and result views.",
    document: notebookFromYaml(simNotebookYaml)
  },
  bmw: {
    id: "bmw",
    label: "BMW",
    description: "BMW browser notebook with a baseline run, two scenarios, and accounting views.",
    document: notebookFromYaml(bmwNotebookYaml)
  },
  "gl2-pc": {
    id: "gl2-pc",
    label: "GL2 PC",
    description:
      "PC notebook based on the gl2-pc article baseline, balance-sheet views, and two deterministic extensions.",
    document: notebookFromYaml(gl2PcNotebookYaml)
  },
  "gl6-dis": {
    id: "gl6-dis",
    label: "GL6 DIS",
    description: "DIS notebook based on the gl6-dis article baseline, matrices, and two scenarios.",
    document: notebookFromYaml(gl6DisNotebookYaml)
  },
  "gl6-dis-rentier": {
    id: "gl6-dis-rentier",
    label: "GL6 DIS Rentier",
    description:
      "Two-household DIS notebook with workers, rentiers, taxes, and a money-versus-bonds portfolio split.",
    document: notebookFromYaml(gl6DisRentierNotebookYaml)
  },
  "gl6-dis-rentier-v2": {
    id: "gl6-dis-rentier-v2",
    label: "GL6 DIS Rentier v2",
    description: "Separate v2 notebook entry for the DIS rentier template.",
    document: notebookFromYaml(gl6DisRentierV2NotebookYaml)
  },
  "gl7-insout": {
    id: "gl7-insout",
    label: "GL7 INSOUT",
    description:
      "INSOUT notebook based on the gl7-insout article baseline, matrices, and selected scenario experiments.",
    document: notebookFromYaml(gl7InsoutNotebookYaml)
  },
  "gl8-growth": {
    id: "gl8-growth",
    label: "GL8 GROWTH",
    description:
      "GROWTH notebook based on the gl8-growth article baseline, accounting matrices, and selected policy experiments.",
    document: notebookFromYaml(gl8GrowthNotebookYaml)
  },
  "interbank-liquidity-risk": {
    id: "interbank-liquidity-risk",
    label: "Interbank liquidity risk",
    description:
      "Runnable starter notebook inspired by Reale's interbank-market SFC paper, with two-bank funding choice, reserve management, and a liquidity-stress scenario.",
    document: notebookFromYaml(interbankLiquidityRiskNotebookYaml)
  },
  opensimplest: {
    id: "opensimplest",
    label: "OPENSIMPLEST",
    description:
      "Compact open-economy SFC notebook with four sectors, portfolio allocation, exchange-rate adjustment, and an export-shock scenario.",
    document: notebookFromYaml(opensimplestNotebookYaml)
  },
  "opensimplest-levy": {
    id: "opensimplest-levy",
    label: "OPENSIMPLEST Levy",
    description:
      "Levy WP 1105 aligned OPENSIMPLEST notebook using paper-style superscript symbols, lagged interest-rate flows, and a 150-period baseline.",
    document: notebookFromYaml(opensimplestLevyNotebookYaml)
  },
  "predator-prey": {
    id: "predator-prey",
    label: "Predator-prey",
    description:
      "Minimal reference notebook with lagged predator-prey dynamics, one baseline run, and one scenario shock.",
    document: notebookFromYaml(predatorPreyNotebookYaml)
  },
  "simple-epidemic": {
    id: "simple-epidemic",
    label: "Simple epidemic",
    description:
      "Runnable version of the legacy simple epidemic model with stock equations, a contact lookup approximation, and a baseline chart.",
    document: notebookFromYaml(simpleEpidemicNotebookYaml)
  },
  "solver-overview": {
    id: "solver-overview",
    label: "Solver overview",
    description:
      "Runnable version of the solver overview block-ordering example with one acyclic chain, one cyclic block, and one scenario.",
    document: notebookFromYaml(solverOverviewNotebookYaml)
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
