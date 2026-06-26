import {
  computeEigenpair,
  type ComplexValue,
  type Eigenvalue,
  type StabilityAnalysis
} from "@sfcr/core";

import { formatEigenvalue } from "./stabilityAtPeriod";
import {
  formatRelativeGain,
  type StabilityDeltaPropagationView
} from "./stabilityDeltaPropagation";

const STABILITY_RAW_MATRIX_WARN_SIZE = 24;

export type StabilityRawMatrixKey = "T" | "A0" | "A1" | "residual" | "eigenvectors" | "delta";

export interface StabilityRawMatrixView {
  key: StabilityRawMatrixKey;
  label: string;
  variables: string[];
  matrix?: number[][];
  vector?: number[];
}

interface StabilityRawEigenvectorRow {
  variable: string;
  re: number;
  im: number;
  magnitude: number;
  weight: number;
}

interface StabilityRawEigenmodeView {
  label: string;
  eigenvalueLabel: string;
  reliable: boolean;
  rows: StabilityRawEigenvectorRow[];
}

export interface StabilityRawDataViews {
  period: number;
  variableCount: number;
  largeModel: boolean;
  matrices: StabilityRawMatrixView[];
  eigenmodes: StabilityRawEigenmodeView[];
}

export function buildStabilityRawDataViews(analysis: StabilityAnalysis): StabilityRawDataViews {
  const variableCount = analysis.variables.length;

  return {
    period: analysis.period,
    variableCount,
    largeModel: variableCount > STABILITY_RAW_MATRIX_WARN_SIZE,
    matrices: [
      { key: "T", label: "T = −A₀⁻¹A₁", variables: analysis.variables, matrix: analysis.T },
      { key: "A0", label: "A₀ = ∂F/∂xₜ", variables: analysis.variables, matrix: analysis.A0 },
      { key: "A1", label: "A₁ = ∂F/∂xₜ₋₁", variables: analysis.variables, matrix: analysis.A1 },
      {
        key: "residual",
        label: "F(xₜ, xₜ₋₁) residual",
        variables: analysis.variables,
        vector: analysis.residual
      }
    ],
    eigenmodes: buildDebugEigenmodes(analysis)
  };
}

function buildDebugEigenmodes(analysis: StabilityAnalysis): StabilityRawEigenmodeView[] {
  const modes: Array<{ label: string; eigenvalue: Eigenvalue; seedIndex: number }> = [
    { label: "Dominant mode", eigenvalue: analysis.dominantMode.eigenvalue, seedIndex: 0 }
  ];

  for (const [index, mode] of analysis.nearUnitRootModes.entries()) {
    modes.push({
      label: `Near unit-root ${index + 1}`,
      eigenvalue: mode.eigenvalue,
      seedIndex: index + 1
    });
  }

  const seen = new Set<string>();
  const views: StabilityRawEigenmodeView[] = [];

  for (const mode of modes) {
    const key = eigenvalueKey(mode.eigenvalue);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    const pair = computeEigenpair(analysis.T, mode.eigenvalue, { seedIndex: mode.seedIndex });
    views.push({
      label: mode.label,
      eigenvalueLabel: formatEigenvalue(pair.eigenvalue.re, pair.eigenvalue.im),
      reliable: pair.reliable,
      rows: buildEigenvectorRows(analysis.variables, pair.eigenvector)
    });
  }

  return views;
}

function buildEigenvectorRows(
  variables: string[],
  eigenvector: ComplexValue[]
): StabilityRawEigenvectorRow[] {
  const magnitudes = eigenvector.map((component) => Math.hypot(component.re, component.im));
  const maxMagnitude = magnitudes.reduce((max, value) => Math.max(max, value), 0);

  return variables
    .map((variable, index) => {
      const component = eigenvector[index] ?? { re: 0, im: 0 };
      const magnitude = magnitudes[index] ?? 0;
      return {
        variable,
        re: component.re,
        im: component.im,
        magnitude,
        weight: maxMagnitude > 0 ? magnitude / maxMagnitude : 0
      };
    })
    .sort((left, right) => {
      const magnitudeDelta = right.magnitude - left.magnitude;
      if (Math.abs(magnitudeDelta) > 1e-12) {
        return magnitudeDelta;
      }
      return left.variable.localeCompare(right.variable);
    });
}

function eigenvalueKey(eigenvalue: Eigenvalue): string {
  return `${eigenvalue.re.toFixed(8)}:${eigenvalue.im.toFixed(8)}`;
}

export function formatRawMatrixCell(value: number): string {
  if (!Number.isFinite(value)) {
    return "—";
  }

  if (value === 0) {
    return "0";
  }

  if (Math.abs(value) >= 1e4 || Math.abs(value) < 1e-3) {
    return value.toExponential(3);
  }

  return value.toFixed(4);
}

export function formatRawComplexCell(component: ComplexValue): string {
  if (Math.abs(component.im) < 1e-10) {
    return formatRawMatrixCell(component.re);
  }

  const re = formatRawMatrixCell(component.re);
  const im = formatRawMatrixCell(Math.abs(component.im));
  const sign = component.im >= 0 ? "+" : "−";
  return `${re} ${sign} ${im}i`;
}

export function matrixToMarkdownTable(
  label: string,
  variables: string[],
  matrix: number[][]
): string {
  const header = ["", ...variables].map(escapeMarkdownCell).join(" | ");
  const separator = ["", ...variables].map(() => "---").join(" | ");
  const rows = matrix.map((row, rowIndex) => {
    const cells = [
      variables[rowIndex] ?? "",
      ...row.map((value) => formatRawMatrixCell(value))
    ];
    return cells.map(escapeMarkdownCell).join(" | ");
  });

  return [`### ${label}`, "", `| ${header} |`, `| ${separator} |`, ...rows.map((row) => `| ${row} |`)].join(
    "\n"
  );
}

function vectorToMarkdownTable(
  label: string,
  variables: string[],
  vector: number[]
): string {
  const lines = [
    `### ${label}`,
    "",
    "| Variable | F |",
    "| --- | --- |",
    ...variables.map((variable, index) => {
      const value = vector[index] ?? 0;
      return `| ${escapeMarkdownCell(variable)} | ${formatRawMatrixCell(value)} |`;
    })
  ];
  return lines.join("\n");
}

function eigenmodeToMarkdown(mode: StabilityRawEigenmodeView): string {
  const lines = [
    `### ${mode.label} (λ = ${mode.eigenvalueLabel})`,
    "",
    `Reliable: ${mode.reliable ? "yes" : "no"}`,
    "",
    "| Variable | Re | Im | |v| | weight |",
    "| --- | --- | --- | --- | --- |",
    ...mode.rows.map(
      (row) =>
        `| ${escapeMarkdownCell(row.variable)} | ${formatRawMatrixCell(row.re)} | ${formatRawMatrixCell(row.im)} | ${formatRawMatrixCell(row.magnitude)} | ${formatRawMatrixCell(row.weight)} |`
    )
  ];
  return lines.join("\n");
}

function deltaPropagationToMarkdown(view: StabilityDeltaPropagationView): string {
  const lines = [
    `### Linear one-step response (Δxₜ = T Δxₜ₋₁)`,
    "",
    `Shock: ${view.shockLabel}`,
    "",
    "| Variable | Δxₜ₋₁ | Δxₜ (TΔ) | Gain (linear) | xₜ* | xₜ linear | Δx path | Gain (path) |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...view.rows.map(
      (row) =>
        `| ${escapeMarkdownCell(row.variable)} | ${formatRawMatrixCell(row.deltaLag)} | ${formatRawMatrixCell(row.deltaCurrent)} | ${formatRelativeGain(row.linearGain)} | ${formatRawMatrixCell(row.xStar)} | ${formatRawMatrixCell(row.xLinear)} | ${formatRawMatrixCell(row.pathDelta)} | ${formatRelativeGain(row.pathGain)} |`
    )
  ];
  return lines.join("\n");
}

export function buildStabilityRawMarkdown(
  views: StabilityRawDataViews,
  deltaPropagation?: StabilityDeltaPropagationView | null
): string {
  const sections = [
    `# Local stability raw data (period ${views.period + 1})`,
    "",
    "_Local linearization at the scrubbed operating point; not global simulation stability._",
    ""
  ];

  for (const view of views.matrices) {
    if (view.key === "residual" && view.vector) {
      sections.push(vectorToMarkdownTable(view.label, view.variables, view.vector), "");
      continue;
    }

    if (view.matrix) {
      sections.push(matrixToMarkdownTable(view.label, view.variables, view.matrix), "");
    }
  }

  for (const mode of views.eigenmodes) {
    sections.push(eigenmodeToMarkdown(mode), "");
  }

  if (deltaPropagation) {
    sections.push(deltaPropagationToMarkdown(deltaPropagation), "");
  }

  return sections.join("\n").trimEnd() + "\n";
}

export function buildStabilityRawJson(
  views: StabilityRawDataViews,
  analysis: StabilityAnalysis,
  deltaPropagation?: StabilityDeltaPropagationView | null
): string {
  const payload = {
    period: analysis.period,
    uiPeriod: analysis.period + 1,
    variables: analysis.variables,
    residualNorm: analysis.residualNorm,
    spectralRadius: analysis.spectralRadius,
    classification: analysis.classification,
    residual: analysis.residual,
    A0: analysis.A0,
    A1: analysis.A1,
    T: analysis.T,
    eigenvalues: analysis.eigenvalues,
    eigenmodes: views.eigenmodes.map((mode) => ({
      label: mode.label,
      eigenvalue: mode.eigenvalueLabel,
      reliable: mode.reliable,
      components: mode.rows
    })),
    deltaPropagation: deltaPropagation
      ? {
          shockLabel: deltaPropagation.shockLabel,
          rows: deltaPropagation.rows
        }
      : undefined
  };

  return JSON.stringify(payload, null, 2);
}

function escapeMarkdownCell(value: string): string {
  return value.replace(/\|/g, "\\|");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function deltaPropagationToHtmlSection(view: StabilityDeltaPropagationView): string {
  const rows = view.rows
    .map(
      (row) =>
        `<tr><th scope="row">${escapeHtml(row.variable)}</th><td>${escapeHtml(formatRawMatrixCell(row.deltaLag))}</td><td>${escapeHtml(formatRawMatrixCell(row.deltaCurrent))}</td><td>${escapeHtml(formatRelativeGain(row.linearGain))}</td><td>${escapeHtml(formatRawMatrixCell(row.xStar))}</td><td>${escapeHtml(formatRawMatrixCell(row.xLinear))}</td><td>${escapeHtml(formatRawMatrixCell(row.pathDelta))}</td><td>${escapeHtml(formatRelativeGain(row.pathGain))}</td></tr>`
    )
    .join("");

  return `<section>
  <h2>Linear one-step response (Δxₜ = T Δxₜ₋₁)</h2>
  <p class="eigenmeta">${escapeHtml(view.shockLabel)}</p>
  <div class="scroll">
    <table>
      <thead><tr><th scope="col">Variable</th><th scope="col">Δxₜ₋₁</th><th scope="col">Δxₜ (TΔ)</th><th scope="col">Gain (linear)</th><th scope="col">xₜ*</th><th scope="col">xₜ linear</th><th scope="col">Δx path</th><th scope="col">Gain (path)</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
</section>`;
}

export function buildStabilityRawHtmlDocument(
  views: StabilityRawDataViews,
  analysis: StabilityAnalysis,
  periodLabel: number,
  deltaPropagation?: StabilityDeltaPropagationView | null
): string {
  const sections: string[] = [];

  for (const view of views.matrices) {
    if (view.vector) {
      sections.push(matrixViewToHtmlSection(view.label, vectorToHtmlTable(view.variables, view.vector)));
      continue;
    }

    if (view.matrix) {
      sections.push(matrixViewToHtmlSection(view.label, matrixToHtmlTable(view.variables, view.matrix)));
    }
  }

  for (const mode of views.eigenmodes) {
    sections.push(eigenmodeToHtmlSection(mode));
  }

  if (deltaPropagation) {
    sections.push(deltaPropagationToHtmlSection(deltaPropagation));
  }

  const largeWarning = views.largeModel
    ? `<p class="warn">Large state (${views.variableCount} variables). Tables may be wide; scroll horizontally.</p>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>SFCR transition matrix — period ${periodLabel}</title>
  <style>
    body { font-family: system-ui, sans-serif; color: #0f172a; line-height: 1.45; margin: 1.25rem 1.5rem 2rem; }
    h1 { font-size: 1.15rem; margin: 0 0 0.35rem; }
    .meta, .note { color: #64748b; font-size: 0.88rem; margin: 0.25rem 0 0.75rem; }
    .warn { color: #92400e; font-size: 0.88rem; }
    section { margin: 1.25rem 0; }
    h2 { font-size: 0.95rem; margin: 0 0 0.5rem; color: #334155; }
    h3 { font-size: 0.88rem; margin: 0 0 0.35rem; font-weight: 600; }
    .scroll { overflow: auto; max-width: 100%; }
    table { border-collapse: collapse; font-size: 0.82rem; font-variant-numeric: tabular-nums; }
    th, td { border-bottom: 1px solid rgba(148, 163, 184, 0.35); padding: 0.3rem 0.45rem; text-align: left; }
    thead th { color: #64748b; font-size: 0.76rem; }
    tbody th { font-weight: 600; }
    .reliable { color: #166534; font-weight: 600; }
    .unreliable { color: #92400e; font-weight: 600; }
    .eigenmode { border-top: 1px solid rgba(148, 163, 184, 0.25); padding-top: 0.75rem; }
    .eigenmeta { color: #64748b; font-size: 0.82rem; margin: 0 0 0.5rem; }
  </style>
</head>
<body>
  <h1>Transition matrix (debug)</h1>
  <p class="meta">Period ${periodLabel} · ${views.variableCount} endogenous variable${views.variableCount === 1 ? "" : "s"} · spectral radius ${analysis.spectralRadius.toFixed(4)} · ${escapeHtml(analysis.classification)}</p>
  <p class="note">Local linearization at the scrubbed operating point (T = −A₀⁻¹A₁). Not global simulation stability.</p>
  ${largeWarning}
  ${sections.join("\n")}
</body>
</html>`;
}

function matrixViewToHtmlSection(title: string, tableHtml: string): string {
  return `<section><h2>${escapeHtml(title)}</h2><div class="scroll">${tableHtml}</div></section>`;
}

function matrixToHtmlTable(variables: string[], matrix: number[][]): string {
  const headerCells = variables.map((variable) => `<th scope="col">${escapeHtml(variable)}</th>`).join("");
  const bodyRows = matrix
    .map((row, rowIndex) => {
      const rowLabel = variables[rowIndex] ?? "";
      const dataCells = row
        .map((value) => `<td>${escapeHtml(formatRawMatrixCell(value))}</td>`)
        .join("");
      return `<tr><th scope="row">${escapeHtml(rowLabel)}</th>${dataCells}</tr>`;
    })
    .join("");

  return `<table><thead><tr><th scope="col"></th>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table>`;
}

function vectorToHtmlTable(variables: string[], vector: number[]): string {
  const rows = variables
    .map((variable, index) => {
      const value = vector[index] ?? 0;
      return `<tr><th scope="row">${escapeHtml(variable)}</th><td>${escapeHtml(formatRawMatrixCell(value))}</td></tr>`;
    })
    .join("");

  return `<table><thead><tr><th scope="col">Variable</th><th scope="col">Residual</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function eigenmodeToHtmlSection(mode: StabilityRawEigenmodeView): string {
  const qualityClass = mode.reliable ? "reliable" : "unreliable";
  const rows = mode.rows
    .map(
      (row) =>
        `<tr><th scope="row">${escapeHtml(row.variable)}</th><td>${escapeHtml(formatRawComplexCell({ re: row.re, im: row.im }))}</td><td>${escapeHtml(formatRawMatrixCell(row.magnitude))}</td><td>${escapeHtml(formatRawMatrixCell(row.weight))}</td></tr>`
    )
    .join("");

  return `<section class="eigenmode">
  <h2>${escapeHtml(mode.label)}</h2>
  <p class="eigenmeta">λ = ${escapeHtml(mode.eigenvalueLabel)} · <span class="${qualityClass}">${mode.reliable ? "Reliable" : "Unreliable"}</span></p>
  <div class="scroll">
    <table>
      <thead><tr><th scope="col">Variable</th><th scope="col">Component</th><th scope="col">|v|</th><th scope="col">Weight</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
</section>`;
}

const STABILITY_RAW_POPUP_NAME = "sfcr-stability-raw";

export function openStabilityRawDataWindow(
  views: StabilityRawDataViews,
  analysis: StabilityAnalysis,
  periodLabel: number,
  deltaPropagation?: StabilityDeltaPropagationView | null
): boolean {
  const html = buildStabilityRawHtmlDocument(views, analysis, periodLabel, deltaPropagation);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const popup = window.open(url, STABILITY_RAW_POPUP_NAME, "width=1024,height=800");

  if (!popup) {
    URL.revokeObjectURL(url);
    return false;
  }

  popup.addEventListener("load", () => URL.revokeObjectURL(url), { once: true });
  popup.focus();
  return true;
}
