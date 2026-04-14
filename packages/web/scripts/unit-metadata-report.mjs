import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webRoot = path.resolve(__dirname, "..");

const defaultFiles = [
  "src/notebook/templates/bmw.notebook.json",
  "src/notebook/templates/gl2-pc.notebook.json",
  "src/notebook/templates/gl6-dis.notebook.json",
  "src/notebook/templates/gl7-insout.notebook.json",
  "src/notebook/templates/gl8-growth.notebook.json"
].map((relativePath) => path.resolve(webRoot, relativePath));

const args = new Set(process.argv.slice(2));
const requestedFiles = process.argv
  .slice(2)
  .filter((value) => !value.startsWith("--"))
  .map((inputPath) => path.resolve(process.cwd(), inputPath));
const files = requestedFiles.length > 0 ? requestedFiles : defaultFiles;
const shouldWrite = args.has("--write");

let changedFileCount = 0;

for (const filePath of files) {
  const source = await fs.readFile(filePath, "utf8");
  const document = JSON.parse(source);
  let fileChanged = false;

  console.log(`\n# ${path.relative(webRoot, filePath)}`);
  console.log(`Notebook: ${document.title}`);

  for (const model of collectModelSections(document)) {
    const report = analyzeModelSection(model);
    console.log(`\nModel: ${model.modelId}`);
    console.log(
      `Legacy metadata converted: ${report.convertedCount}, existing signature metadata: ${report.signatureCount}`
    );
    console.log(
      `High-confidence stock/flow candidates: ${report.highConfidence.length}, unresolved variables: ${report.unresolved.length}`
    );

    if (report.highConfidence.length > 0) {
      console.log("Candidates:");
      for (const item of report.highConfidence) {
        console.log(
          `  - ${item.name}: ${item.stockFlow} [${item.reasons.join("; ")}]`
        );
      }
    }

    if (report.unresolved.length > 0) {
      console.log("Unresolved:");
      for (const item of report.unresolved) {
        console.log(`  - ${item.name}${item.kind === "external" ? " (external)" : ""}`);
      }
    }

    if (shouldWrite && report.didMutate) {
      fileChanged = true;
    }
  }

  if (shouldWrite && fileChanged) {
    await fs.writeFile(filePath, `${stringifyJsonWithCompactLeaves(document)}\n`, "utf8");
    changedFileCount += 1;
  }
}

if (shouldWrite) {
  console.log(`\nUpdated ${changedFileCount} notebook file(s).`);
}

function collectModelSections(document) {
  const equationsByModel = new Map();
  const externalsByModel = new Map();

  for (const cell of document.cells ?? []) {
    if (cell.type === "equations") {
      equationsByModel.set(cell.modelId, cell);
    }
    if (cell.type === "externals") {
      externalsByModel.set(cell.modelId, cell);
    }
  }

  return [...equationsByModel.entries()].map(([modelId, equationsCell]) => ({
    document,
    modelId,
    equationsCell,
    externalsCell: externalsByModel.get(modelId) ?? null
  }));
}

function analyzeModelSection(model) {
  let convertedCount = 0;
  let signatureCount = 0;
  let didMutate = false;

  for (const equation of model.equationsCell.equations ?? []) {
    const { changed, hasSignature } = normalizeUnitMetaHolder(equation);
    if (changed) {
      convertedCount += 1;
      didMutate = true;
    }
    if (hasSignature) {
      signatureCount += 1;
    }
  }

  for (const external of model.externalsCell?.externals ?? []) {
    const { changed, hasSignature } = normalizeUnitMetaHolder(external);
    if (changed) {
      convertedCount += 1;
      didMutate = true;
    }
    if (hasSignature) {
      signatureCount += 1;
    }
  }

  const stockFlowEvidence = new Map();
  for (const equation of model.equationsCell.equations ?? []) {
    const name = equation.name?.trim();
    if (!name) {
      continue;
    }

    const unitMeta = equation.unitMeta;
    if (unitMeta?.stockFlow) {
      addEvidence(stockFlowEvidence, name, unitMeta.stockFlow, "existing metadata");
    }

    const expression = equation.expression?.trim() ?? "";
    if (expressionStartsWithLagOfSelf(expression, name)) {
      addEvidence(stockFlowEvidence, name, "stock", "self-accumulation equation");
    }
    if (expressionContainsDiffOf(expression, name)) {
      addEvidence(stockFlowEvidence, name, "stock", "explicit d(name) usage");
    }
  }

  for (const matrixCell of model.document.cells ?? []) {
    if (matrixCell.type !== "matrix") {
      continue;
    }
    const title = (matrixCell.title ?? "").toLowerCase();
    if (title.includes("balance sheet")) {
      collectMatrixBalanceSheetEvidence(matrixCell, stockFlowEvidence);
    }
    if (title.includes("transaction")) {
      collectMatrixTransactionFlowEvidence(matrixCell, stockFlowEvidence);
    }
  }

  const highConfidence = [];
  const unresolved = [];
  const allVariables = collectVariables(model);

  for (const variable of allVariables) {
    const evidence = stockFlowEvidence.get(variable.name) ?? [];
    const kinds = new Set(evidence.map((item) => item.stockFlow));
    const hasUnitMeta = Boolean(variable.unitMeta?.signature || variable.unitMeta?.stockFlow);

    if (!hasUnitMeta && kinds.size === 1) {
      const stockFlow = evidence[0].stockFlow;
      if (stockFlow === "stock" || stockFlow === "flow") {
        highConfidence.push({
          kind: variable.kind,
          name: variable.name,
          stockFlow,
          reasons: evidence.map((item) => item.reason)
        });
        continue;
      }
    }

    if (!hasUnitMeta) {
      unresolved.push(variable);
    }
  }

  highConfidence.sort((left, right) => left.name.localeCompare(right.name));
  unresolved.sort((left, right) => left.name.localeCompare(right.name));

  return { convertedCount, didMutate, highConfidence, signatureCount, unresolved };
}

function collectVariables(model) {
  return [
    ...(model.equationsCell.equations ?? []).map((equation) => ({
      kind: "equation",
      name: equation.name?.trim(),
      unitMeta: equation.unitMeta
    })),
    ...(model.externalsCell?.externals ?? []).map((external) => ({
      kind: "external",
      name: external.name?.trim(),
      unitMeta: external.unitMeta
    }))
  ].filter((item) => item.name);
}

function normalizeUnitMetaHolder(holder) {
  if (!holder.unitMeta) {
    return { changed: false, hasSignature: false };
  }

  if (holder.unitMeta.signature) {
    holder.unitMeta = {
      ...holder.unitMeta,
      signature: normalizeSignature(holder.unitMeta.signature),
      stockFlow: holder.unitMeta.stockFlow ?? holder.unitMeta.dimensionKind
    };
    return { changed: false, hasSignature: true };
  }

  const migrated = migrateLegacyUnitMeta(holder.unitMeta);
  if (!migrated) {
    return { changed: false, hasSignature: false };
  }

  holder.unitMeta = migrated;
  return { changed: true, hasSignature: true };
}

function migrateLegacyUnitMeta(unitMeta) {
  const stockFlow = unitMeta.stockFlow ?? unitMeta.dimensionKind;
  const baseUnit = unitMeta.baseUnit;
  if (!stockFlow && !baseUnit) {
    return null;
  }

  let signature = {};
  if (baseUnit === "$") {
    signature = stockFlow === "flow" ? { money: 1, time: -1 } : { money: 1 };
  } else if (baseUnit === "items") {
    signature = stockFlow === "flow" ? { items: 1, time: -1 } : { items: 1 };
  }

  return {
    ...unitMeta,
    stockFlow,
    signature: normalizeSignature(signature)
  };
}

function normalizeSignature(signature) {
  const normalized = {};
  for (const key of ["money", "items", "time"]) {
    const value = signature?.[key] ?? 0;
    if (value !== 0) {
      normalized[key] = value;
    }
  }
  return normalized;
}

function addEvidence(store, name, stockFlow, reason) {
  if (!name) {
    return;
  }
  const list = store.get(name) ?? [];
  list.push({ stockFlow, reason });
  store.set(name, list);
}

function expressionStartsWithLagOfSelf(expression, variableName) {
  const normalized = expression.replace(/\s+/g, "");
  return normalized.startsWith(`lag(${variableName})+`) || normalized.startsWith(`lag(${variableName})-`);
}

function expressionContainsDiffOf(expression, variableName) {
  return new RegExp(`\\bd\\(${escapeRegExp(variableName)}\\)`).test(expression);
}

function collectMatrixBalanceSheetEvidence(matrixCell, stockFlowEvidence) {
  for (const row of matrixCell.rows ?? []) {
    for (const value of row.values ?? []) {
      for (const variableName of extractVariableNames(value)) {
        addEvidence(stockFlowEvidence, variableName, "stock", `balance-sheet matrix '${row.label}' row`);
      }
    }
  }
}

function collectMatrixTransactionFlowEvidence(matrixCell, stockFlowEvidence) {
  for (const row of matrixCell.rows ?? []) {
    for (const value of row.values ?? []) {
      if (!value || value === "0") {
        continue;
      }

      for (const diffName of extractDiffNames(value)) {
        addEvidence(stockFlowEvidence, diffName, "stock", `transactions-flow matrix '${row.label}' uses d(${diffName})`);
      }

      if (extractDiffNames(value).length > 0) {
        continue;
      }

      const variableNames = extractVariableNames(value);
      if (variableNames.length === 1) {
        addEvidence(
          stockFlowEvidence,
          variableNames[0],
          "flow",
          `transactions-flow matrix '${row.label}' direct term`
        );
      }
    }
  }
}

function extractDiffNames(source) {
  return [...source.matchAll(/\bd\(([A-Za-z_][A-Za-z0-9_.]*)\)/g)].map((match) => match[1]);
}

function extractVariableNames(source) {
  const names = new Set();
  for (const match of source.matchAll(/[A-Za-z_][A-Za-z0-9_.]*/g)) {
    const token = match[0];
    if (token === "lag" || token === "d" || token === "if" || token === "else") {
      continue;
    }
    names.add(token);
  }
  return [...names];
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stringifyJsonWithCompactLeaves(value, level = 0) {
  if (value == null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "[]";
    }

    if (value.every(isPrimitiveJsonValue)) {
      return `[${value.map((entry) => stringifyInlineJsonValue(entry)).join(", ")}]`;
    }

    const indentation = "  ".repeat(level);
    const childIndentation = "  ".repeat(level + 1);
    return `[\n${value
      .map((entry) => `${childIndentation}${stringifyJsonWithCompactLeaves(entry, level + 1)}`)
      .join(",\n")}\n${indentation}]`;
  }

  const entries = Object.entries(value);
  if (entries.length === 0) {
    return "{}";
  }

  if (level > 0 && entries.every(([, entryValue]) => isInlineJsonValue(entryValue))) {
    return `{ ${entries
      .map(([key, entryValue]) => `${JSON.stringify(key)}: ${stringifyInlineJsonValue(entryValue)}`)
      .join(", ")} }`;
  }

  const indentation = "  ".repeat(level);
  const childIndentation = "  ".repeat(level + 1);
  return `{\n${entries
    .map(
      ([key, entryValue]) =>
        `${childIndentation}${JSON.stringify(key)}: ${stringifyJsonWithCompactLeaves(
          entryValue,
          level + 1
        )}`
    )
    .join(",\n")}\n${indentation}}`;
}

function stringifyInlineJsonValue(value) {
  if (value == null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stringifyInlineJsonValue(entry)).join(", ")}]`;
  }

  return `{ ${Object.entries(value)
    .map(([key, entryValue]) => `${JSON.stringify(key)}: ${stringifyInlineJsonValue(entryValue)}`)
    .join(", ")} }`;
}

function isInlineJsonValue(value) {
  if (value == null || typeof value !== "object") {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every((entry) => entry == null || typeof entry !== "object");
  }

  return Object.values(value).every((entry) => entry == null || typeof entry !== "object");
}

function isPrimitiveJsonValue(value) {
  return value == null || typeof value !== "object";
}
