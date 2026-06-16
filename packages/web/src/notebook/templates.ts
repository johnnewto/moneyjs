import bmwNotebookYaml from "./templates/bmw.notebook.yaml?raw";
import eco3IoPcNotebookYaml from "./templates/eco-3io-pc.notebook.yaml?raw";
import endogenousMoneyNotebookYaml from "./templates/endogenous-money.notebook.yaml?raw";
import gl2PcNotebookYaml from "./templates/gl2-pc.notebook.yaml?raw";
import pcTwoClassNotebookYaml from "./templates/pc-two-class.notebook.yaml?raw";
import ioPcNotebookYaml from "./templates/io-pc.notebook.yaml?raw";
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
import wernerQuantityTheoryCreditNotebookYaml from "./templates/werner_quantity_theory_credit.notebook.yaml?raw";
import wernerQtcExplainerNotebookYaml from "./templates/werner_qtc_explainer.notebook.yaml?raw";
import { analyzeNotebookSource, type NotebookSourceDiagnostic } from "./document";
import type { NotebookDocument } from "./types";

export type NotebookTemplateId =
  | "bmw"
  | "eco-3io-pc"
  | "endogenous-money"
  | "gl2-pc"
  | "pc-two-class"
  | "io-pc"
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
  | "solver-overview"
  | "werner-quantity-theory-credit"
  | "werner-qtc-explainer";
export const DEFAULT_NOTEBOOK_TEMPLATE_ID: NotebookTemplateId = "bmw";

export interface NotebookTemplateDefinition {
  id: NotebookTemplateId;
  label: string;
  description: string;
}

export type NotebookTemplateLoadResult =
  | { ok: true; document: NotebookDocument }
  | { ok: false; diagnostics: NotebookSourceDiagnostic[] };

const NOTEBOOK_TEMPLATE_YAML: Record<NotebookTemplateId, string> = {
  sim: simNotebookYaml,
  bmw: bmwNotebookYaml,
  "eco-3io-pc": eco3IoPcNotebookYaml,
  "endogenous-money": endogenousMoneyNotebookYaml,
  "gl2-pc": gl2PcNotebookYaml,
  "pc-two-class": pcTwoClassNotebookYaml,
  "io-pc": ioPcNotebookYaml,
  "gl6-dis": gl6DisNotebookYaml,
  "gl6-dis-rentier": gl6DisRentierNotebookYaml,
  "gl6-dis-rentier-v2": gl6DisRentierV2NotebookYaml,
  "gl7-insout": gl7InsoutNotebookYaml,
  "gl8-growth": gl8GrowthNotebookYaml,
  "interbank-liquidity-risk": interbankLiquidityRiskNotebookYaml,
  opensimplest: opensimplestNotebookYaml,
  "opensimplest-levy": opensimplestLevyNotebookYaml,
  "predator-prey": predatorPreyNotebookYaml,
  "simple-epidemic": simpleEpidemicNotebookYaml,
  "solver-overview": solverOverviewNotebookYaml,
  "werner-quantity-theory-credit": wernerQuantityTheoryCreditNotebookYaml,
  "werner-qtc-explainer": wernerQtcExplainerNotebookYaml
};

export const NOTEBOOK_TEMPLATES: Record<NotebookTemplateId, NotebookTemplateDefinition> = {
  sim: {
    id: "sim",
    label: "SIM",
    description:
      "Godley-Lavoie SIM notebook with baseline, government-spending scenario, accounting matrices, and result views."
  },
  bmw: {
    id: "bmw",
    label: "BMW",
    description: "BMW browser notebook with a baseline run, two scenarios, and accounting views."
  },
  "eco-3io-pc": {
    id: "eco-3io-pc",
    label: "ECO-3IO-PC",
    description:
      "Florence keynote ECO-3IO-PC notebook with three-industry IO structure, ecological stocks and flows, and a temperature-feedback scenario."
  },
  "endogenous-money": {
    id: "endogenous-money",
    label: "Endogenous Money",
    description:
      "Runnable BOMD notebook based on the Money From First Principles endogenous-money section."
  },
  "gl2-pc": {
    id: "gl2-pc",
    label: "GL2 PC",
    description:
      "PC notebook based on the gl2-pc article baseline, balance-sheet views, account-transactions matrix, and two deterministic extensions."
  },
  "pc-two-class": {
    id: "pc-two-class",
    label: "PC Two-Class",
    description:
      "PC notebook with poor and rich households, linear poor consumption, log rich consumption, and separate portfolio choice."
  },
  "io-pc": {
    id: "io-pc",
    label: "Model IO-PC",
    description:
      "Six Lectures IO-PC notebook with two-industry input-output structure, inflation-tax consumption, and interest-rate and propensity scenarios."
  },
  "gl6-dis": {
    id: "gl6-dis",
    label: "GL6 DIS",
    description: "DIS notebook based on the gl6-dis article baseline, matrices, and two scenarios."
  },
  "gl6-dis-rentier": {
    id: "gl6-dis-rentier",
    label: "GL6 DIS Rentier",
    description:
      "Two-household DIS notebook with workers, rentiers, taxes, and a money-versus-bonds portfolio split."
  },
  "gl6-dis-rentier-v2": {
    id: "gl6-dis-rentier-v2",
    label: "GL6 DIS Rentier v2",
    description: "Separate v2 notebook entry for the DIS rentier template."
  },
  "gl7-insout": {
    id: "gl7-insout",
    label: "GL7 INSOUT",
    description:
      "INSOUT notebook based on the gl7-insout article baseline, matrices, and selected scenario experiments."
  },
  "gl8-growth": {
    id: "gl8-growth",
    label: "GL8 GROWTH",
    description:
      "GROWTH notebook based on the gl8-growth article baseline, accounting matrices, and selected policy experiments."
  },
  "interbank-liquidity-risk": {
    id: "interbank-liquidity-risk",
    label: "Interbank liquidity risk",
    description:
      "Runnable starter notebook inspired by Reale's interbank-market SFC paper, with two-bank funding choice, reserve management, and a liquidity-stress scenario."
  },
  opensimplest: {
    id: "opensimplest",
    label: "OPENSIMPLEST",
    description:
      "Compact open-economy SFC notebook with four sectors, portfolio allocation, exchange-rate adjustment, and an export-shock scenario."
  },
  "opensimplest-levy": {
    id: "opensimplest-levy",
    label: "OPENSIMPLEST Levy",
    description:
      "Levy WP 1105 aligned OPENSIMPLEST notebook using paper-style superscript symbols, lagged interest-rate flows, and a 150-period baseline."
  },
  "predator-prey": {
    id: "predator-prey",
    label: "Predator-prey",
    description:
      "Minimal reference notebook with lagged predator-prey dynamics, one baseline run, and one scenario shock."
  },
  "simple-epidemic": {
    id: "simple-epidemic",
    label: "Simple epidemic",
    description:
      "Runnable version of the legacy simple epidemic model with stock equations, a contact lookup approximation, and a baseline chart."
  },
  "solver-overview": {
    id: "solver-overview",
    label: "Solver overview",
    description:
      "Runnable version of the solver overview block-ordering example with one acyclic chain, one cyclic block, and one scenario."
  },
  "werner-quantity-theory-credit": {
    id: "werner-quantity-theory-credit",
    label: "Werner QTC",
    description:
      "Credit-allocation notebook contrasting productive credit, asset credit, asset-price inflation, and leverage dynamics."
  },
  "werner-qtc-explainer": {
    id: "werner-qtc-explainer",
    label: "Werner QTC explainer",
    description:
      "Explanatory QTC notebook with the two credit-circulation equations, growth-form interpretation, and allocation scenarios."
  }
};

const loadedDocuments = new Map<NotebookTemplateId, NotebookDocument>();
const loadErrors = new Map<NotebookTemplateId, NotebookSourceDiagnostic[]>();

export function getNotebookTemplateYamlSource(id: NotebookTemplateId): string {
  return NOTEBOOK_TEMPLATE_YAML[id];
}

export function loadNotebookTemplate(id: NotebookTemplateId): NotebookTemplateLoadResult {
  const cachedDocument = loadedDocuments.get(id);
  if (cachedDocument) {
    return { ok: true, document: cachedDocument };
  }

  const cachedError = loadErrors.get(id);
  if (cachedError) {
    return { ok: false, diagnostics: cachedError };
  }

  const analysis = analyzeNotebookSource(NOTEBOOK_TEMPLATE_YAML[id], "yaml");
  if (analysis.parseDiagnostics.length > 0) {
    loadErrors.set(id, analysis.parseDiagnostics);
    return { ok: false, diagnostics: analysis.parseDiagnostics };
  }

  if (analysis.schemaDiagnostics.length > 0) {
    loadErrors.set(id, analysis.schemaDiagnostics);
    return { ok: false, diagnostics: analysis.schemaDiagnostics };
  }

  if (!analysis.document) {
    const diagnostics: NotebookSourceDiagnostic[] = [
      {
        domain: "source",
        message: "Unable to parse template YAML.",
        phase: "parse",
        severity: "error"
      }
    ];
    loadErrors.set(id, diagnostics);
    return { ok: false, diagnostics };
  }

  loadedDocuments.set(id, analysis.document);
  return { ok: true, document: analysis.document };
}

export function isNotebookTemplateLoadable(id: NotebookTemplateId): boolean {
  return loadNotebookTemplate(id).ok;
}

export function getNotebookTemplateLoadDiagnostics(
  id: NotebookTemplateId
): NotebookSourceDiagnostic[] | null {
  const result = loadNotebookTemplate(id);
  return result.ok ? null : result.diagnostics;
}

export function formatNotebookTemplateLoadError(
  id: NotebookTemplateId,
  diagnostics: NotebookSourceDiagnostic[]
): string {
  const label = NOTEBOOK_TEMPLATES[id].label;
  const detail = diagnostics
    .slice(0, 2)
    .map(formatNotebookTemplateDiagnostic)
    .join("; ");
  return `Template “${label}” failed to load: ${detail}`;
}

function formatNotebookTemplateDiagnostic(diagnostic: NotebookSourceDiagnostic): string {
  if (diagnostic.line != null && diagnostic.column != null) {
    return `${diagnostic.message} (line ${diagnostic.line}, column ${diagnostic.column})`;
  }

  return diagnostic.message;
}

export function getNotebookTemplateDocument(id: NotebookTemplateId): NotebookDocument {
  const result = loadNotebookTemplate(id);
  if (!result.ok) {
    throw new Error(formatNotebookTemplateLoadError(id, result.diagnostics));
  }

  return result.document;
}

export function createNotebookFromTemplate(
  id: NotebookTemplateId = DEFAULT_NOTEBOOK_TEMPLATE_ID
): NotebookDocument {
  return structuredClone(getNotebookTemplateDocument(id));
}

export function createNotebookFromTemplateWithFallback(
  templateId: NotebookTemplateId,
  fallbackId: NotebookTemplateId = DEFAULT_NOTEBOOK_TEMPLATE_ID
): {
  document: NotebookDocument;
  loadError: string | null;
  requestedTemplateId: NotebookTemplateId;
  resolvedTemplateId: NotebookTemplateId;
} {
  const requested = loadNotebookTemplate(templateId);
  if (requested.ok) {
    return {
      document: structuredClone(requested.document),
      loadError: null,
      requestedTemplateId: templateId,
      resolvedTemplateId: templateId
    };
  }

  const loadError = formatNotebookTemplateLoadError(templateId, requested.diagnostics);
  if (templateId === fallbackId) {
    throw new Error(loadError);
  }

  const fallback = loadNotebookTemplate(fallbackId);
  if (!fallback.ok) {
    throw new Error(
      `${loadError}; fallback template “${NOTEBOOK_TEMPLATES[fallbackId].label}” also failed to load.`
    );
  }

  return {
    document: structuredClone(fallback.document),
    loadError,
    requestedTemplateId: templateId,
    resolvedTemplateId: fallbackId
  };
}

export function isNotebookTemplateId(value: string): value is NotebookTemplateId {
  return value in NOTEBOOK_TEMPLATES;
}
