import Ajv2020 from "ajv/dist/2020.js";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Document as YamlDocument, isSeq, parseDocument, stringify as stringifyYaml } from "yaml";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webRoot = path.resolve(__dirname, "..");
const workspaceRoot = path.resolve(webRoot, "../..");
const templatesRoot = path.resolve(webRoot, "src/notebook/templates");
const legacyJsonRoot = path.resolve(templatesRoot, "legacy_json");
const generatedRoot = path.resolve(templatesRoot, "generated");
const schemaPath = path.resolve(workspaceRoot, "packages/notebook-core/src/sfcr-notebook.schema.json");

const NOTEBOOK_YAML_FORMAT = "sfcr-notebook-yaml";
const NOTEBOOK_YAML_FORMAT_VERSION = 1;
const DEFAULT_TEMPLATE_IDS = ["bmw", "sim"];
const SOURCE_JSON_FILE_BY_TEMPLATE_ID = {
  "gl6-dis-rentier-v2": "gl6-dis-rentier.notebook.v2.json"
};

const args = process.argv.slice(2);
const write = args.includes("--write");
const init = args.includes("--init");
const compactInit = args.includes("--compact-init");
const preserveIds = args.includes("--preserve-ids");
const convertOnly = args.includes("--convert-only");
const compactOutputDirArg = args.find((arg) => arg.startsWith("--compact-output-dir="));
const compactOutputRoot = compactOutputDirArg ? path.resolve(compactOutputDirArg.slice("--compact-output-dir=".length)) : undefined;
const requestedTemplateIds = args.filter((arg) => !arg.startsWith("--"));
const templateIds = requestedTemplateIds.length ? requestedTemplateIds : DEFAULT_TEMPLATE_IDS;
const schema = JSON.parse(await fs.readFile(schemaPath, "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateSchema = ajv.compile(schema);

await fs.mkdir(generatedRoot, { recursive: true });
if (compactOutputRoot) {
  await fs.mkdir(compactOutputRoot, { recursive: true });
}

for (const templateId of templateIds) {
  const yamlPath = compactInit && compactOutputRoot ? path.resolve(compactOutputRoot, `${templateId}.notebook.yaml`) : path.resolve(templatesRoot, `${templateId}.notebook.yaml`);
  const sourceJsonPath = path.resolve(legacyJsonRoot, SOURCE_JSON_FILE_BY_TEMPLATE_ID[templateId] ?? `${templateId}.notebook.json`);
  const generatedJsonPath = path.resolve(generatedRoot, `${templateId}.notebook.json`);

  if (init) {
    await writeYamlFromJson(sourceJsonPath, yamlPath);
  }
  if (compactInit) {
    await writeCompactYamlFromJson(sourceJsonPath, yamlPath, { preserveIds });
  }
  if (convertOnly && (init || compactInit)) {
    console.log(`${templateId}: ${path.relative(webRoot, sourceJsonPath)} -> ${path.relative(webRoot, yamlPath)}`);
    continue;
  }

  const document = await readNotebookYaml(yamlPath);
  validateNotebookJson(document, yamlPath);

  const compiledJson = `${stringifyJsonWithCompactLeaves(document)}\n`;
  if (write) {
    await fs.writeFile(generatedJsonPath, compiledJson, "utf8");
  } else {
    await assertFileMatches(generatedJsonPath, compiledJson);
  }

  console.log(`${templateId}: ${path.relative(webRoot, yamlPath)} -> ${path.relative(webRoot, generatedJsonPath)}`);
}

async function writeYamlFromJson(jsonPath, yamlPath) {
  const source = await fs.readFile(jsonPath, "utf8");
  const document = JSON.parse(source);
  const yaml = stringifyYaml(
    {
      format: NOTEBOOK_YAML_FORMAT,
      formatVersion: NOTEBOOK_YAML_FORMAT_VERSION,
      ...document
    },
    {
      aliasDuplicateObjects: false,
      collectionStyle: "block",
      lineWidth: 0
    }
  );
  await fs.writeFile(yamlPath, `${yaml.trimEnd()}\n`, "utf8");
}

async function writeCompactYamlFromJson(jsonPath, yamlPath, options) {
  const source = await fs.readFile(jsonPath, "utf8");
  const document = JSON.parse(source);
  const yaml = stringifyCompactYamlEnvelope(buildCompactYamlEnvelope(document, options));
  await fs.writeFile(yamlPath, `${yaml.trimEnd()}\n`, "utf8");
}

function stringifyCompactYamlEnvelope(envelope) {
  const document = new YamlDocument(envelope, { aliasDuplicateObjects: false });
  markFlowSequence(document, ["sectors"]);
  markMatrixFlowSequences(document, "balance");
  markMatrixFlowSequences(document, "transactions");

  return document.toString({
    collectionStyle: "any",
    flowCollectionPadding: false,
    lineWidth: 0
  }).trimEnd();
}

function markMatrixFlowSequences(document, matrixKey) {
  markFlowSequence(document, [matrixKey, "columns"]);
  markFlowSequence(document, [matrixKey, "sectors"]);

  const rows = document.getIn([matrixKey, "rows"], true);
  if (!isSeq(rows)) {
    return;
  }

  rows.items.forEach((row) => {
    if (isSeq(row)) {
      row.flow = true;
    }
  });
}

function markFlowSequence(document, path) {
  const node = document.getIn(path, true);
  if (isSeq(node)) {
    node.flow = true;
  }
}

function buildCompactYamlEnvelope(document, options = {}) {
  const preserveRuntimeIds = options.preserveIds === true;
  const equationsCell = document.cells.find((cell) => cell.type === "equations");
  const solverCell = equationsCell ? document.cells.find((cell) => cell.type === "solver" && cell.modelId === equationsCell.modelId) : undefined;
  const parametersCell = equationsCell ? document.cells.find((cell) => cell.type === "externals" && cell.modelId === equationsCell.modelId) : undefined;
  const initialValuesCell = equationsCell ? document.cells.find((cell) => cell.type === "initial-values" && cell.modelId === equationsCell.modelId) : undefined;
  const baselineRunCell = equationsCell
    ? document.cells.find(
        (cell) => cell.type === "run" && cell.mode === "baseline" && (cell.sourceModelId === equationsCell.modelId || cell.sourceModelCellId === equationsCell.id)
      )
    : document.cells.find((cell) => cell.type === "run" && cell.mode === "baseline");
  const balanceCell = document.cells.find((cell) => cell.type === "matrix" && (/balance/i.test(cell.id) || /balance/i.test(cell.title)));
  const transactionsCell = document.cells.find((cell) => cell.type === "matrix" && (/transaction/i.test(cell.id) || /transaction/i.test(cell.title)));
  const introCell = document.cells.find((cell) => cell.type === "markdown");
  const modelId = equationsCell ? (preserveRuntimeIds ? equationsCell.modelId : generatedCompactModelId(document)) : undefined;
  const baselineRunCellId = baselineRunCell ? (preserveRuntimeIds ? baselineRunCell.id : "baseline-run") : "baseline-run";
  const baselineCharts = baselineRunCell ? document.cells.filter((cell) => cell.type === "chart" && cell.sourceRunCellId === baselineRunCell.id) : [];
  const baselineTables = baselineRunCell ? document.cells.filter((cell) => cell.type === "table" && cell.sourceRunCellId === baselineRunCell.id) : [];

  const idMap = new Map();
  if (introCell) idMap.set(introCell.id, preserveRuntimeIds ? introCell.id : "overview");
  if (balanceCell) idMap.set(balanceCell.id, preserveRuntimeIds ? balanceCell.id : "balance-sheet");
  if (transactionsCell) idMap.set(transactionsCell.id, preserveRuntimeIds ? transactionsCell.id : "transactions-flow");
  if (equationsCell && modelId) idMap.set(equationsCell.id, preserveRuntimeIds ? equationsCell.id : `equations-${modelId}`);
  if (solverCell && modelId) idMap.set(solverCell.id, preserveRuntimeIds ? solverCell.id : `solver-${modelId}`);
  if (parametersCell && modelId) idMap.set(parametersCell.id, preserveRuntimeIds ? parametersCell.id : `parameters-${modelId}`);
  if (initialValuesCell && modelId) idMap.set(initialValuesCell.id, preserveRuntimeIds ? initialValuesCell.id : `initial-values-${modelId}`);
  if (baselineRunCell) idMap.set(baselineRunCell.id, baselineRunCellId);
  baselineCharts.forEach((cell, index) => idMap.set(cell.id, preserveRuntimeIds ? cell.id : `chart-${index + 1}`));
  baselineTables.forEach((cell, index) => idMap.set(cell.id, preserveRuntimeIds ? cell.id : `table-${index + 1}`));
  const modelIdMap = new Map();
  if (equationsCell?.modelId && modelId) modelIdMap.set(equationsCell.modelId, modelId);

  const compactVariables = equationsCell ? buildCompactVariablesFromCells(equationsCell, parametersCell) : undefined;
  const compactUnits = buildCompactUnits(compactVariables);

  const compact = {
    format: NOTEBOOK_YAML_FORMAT,
    formatVersion: NOTEBOOK_YAML_FORMAT_VERSION,
    id: document.id,
    title: document.title,
    metadata: {
      version: 1,
      ...(document.metadata?.template ? { template: document.metadata.template } : {}),
      ...(introCell ? { description: introCell.source } : {})
    },
    ...(modelId ? { modelId } : {})
  };

  if (introCell && (preserveRuntimeIds || introCell.title !== "Overview")) {
    compact.introCell = { ...(preserveRuntimeIds ? { id: introCell.id } : {}), title: introCell.title };
  }
  if (balanceCell) {
    compact.sectors = balanceCell.sectors ?? balanceCell.columns;
  }
  if (compactUnits) {
    compact.units = compactUnits;
  }
  if (equationsCell) {
    compact.variables = compactVariables;
    compact.equations = equationsCell.equations
      .map((equation) => `${equation.desc ? `# ${equation.desc}\n` : ""}${equation.name} ~ ${equation.expression}`)
      .join("\n\n");
    compact.equationCell = buildCompactCellDescriptor(equationsCell, {
      fallbackTitle: "Equations",
      preserveIds: preserveRuntimeIds
    });
  }
  if (balanceCell) {
    compact.balance = buildCompactMatrixDescriptor(balanceCell, { preserveIds: preserveRuntimeIds });
  }
  if (transactionsCell) {
    compact.transactions = buildCompactMatrixDescriptor(transactionsCell, { preserveIds: preserveRuntimeIds });
  }
  if (parametersCell && parametersCell.externals.length > 0) {
    compact.parameters = Object.fromEntries(parametersCell.externals.map((external) => [external.name, scalarFromValueText(external.valueText)]));
    compact.parametersCell = buildCompactCellDescriptor(parametersCell, { fallbackTitle: "Parameters", preserveIds: preserveRuntimeIds });
  }
  if (initialValuesCell) {
    compact["initial-values"] = Object.fromEntries(initialValuesCell.initialValues.map((initialValue) => [initialValue.name, scalarFromValueText(initialValue.valueText)]));
    compact.initialValuesCell = buildCompactCellDescriptor(initialValuesCell, { fallbackTitle: "Initial values", preserveIds: preserveRuntimeIds });
  }
  if (solverCell) {
    compact.solver = buildCompactSolverDescriptor(solverCell.options);
    compact.solverCell = buildCompactCellDescriptor(solverCell, { fallbackTitle: "Solver options", preserveIds: preserveRuntimeIds });
  }
  if (baselineRunCell) {
    compact.baselineRun = {
      ...(preserveRuntimeIds ? { id: baselineRunCell.id } : {}),
      title: baselineRunCell.title,
      ...(baselineRunCell.note ? { note: baselineRunCell.note } : {}),
      ...(baselineRunCell.description ? { description: baselineRunCell.description } : {}),
      resultKey: baselineRunCell.resultKey,
      periods: baselineRunCell.periods,
      ...(baselineRunCell.baselineStartPeriod == null ? {} : { baselineStartPeriod: baselineRunCell.baselineStartPeriod })
    };
  }
  if (baselineCharts.length > 0) {
    compact.charts = baselineCharts.map((cell) => buildCompactChartDescriptor(cell, { preserveIds: preserveRuntimeIds }));
  }
  if (baselineTables.length > 0) {
    compact.tables = baselineTables.map((cell) => buildCompactTableDescriptor(cell, { preserveIds: preserveRuntimeIds }));
  }

  const compactedCellIds = new Set(
    [
      introCell?.id,
      balanceCell?.id,
      transactionsCell?.id,
      equationsCell?.id,
      solverCell?.id,
      parametersCell?.id,
      initialValuesCell?.id,
      baselineRunCell?.id,
      ...baselineCharts.map((cell) => cell.id),
      ...baselineTables.map((cell) => cell.id)
    ].filter((id) => typeof id === "string")
  );
  const passthroughCells = document.cells.filter((cell) => !compactedCellIds.has(cell.id)).map((cell) => rewriteCompactReferences(cell, idMap, modelIdMap));
  if (passthroughCells.length > 0) {
    compact.cells = passthroughCells;
  }
  compact.cellOrder = document.cells.map((cell) => idMap.get(cell.id) ?? cell.id);
  return compact;
}

function generatedCompactModelId(document) {
  return document.metadata?.template ?? slugifyIdentifier(document.id.replace(/-?notebook$/i, "")) ?? "main";
}

function buildCompactCellDescriptor(cell, options) {
  const descriptor = {
    ...(options.preserveIds ? { id: cell.id } : {}),
    ...(cell.title !== options.fallbackTitle ? { title: cell.title } : {}),
    ...compactCellFlags(cell)
  };
  return Object.keys(descriptor).length > 0 ? descriptor : undefined;
}

function buildCompactVariablesFromCells(equationsCell, parametersCell) {
  const variables = {};
  equationsCell.equations.forEach((equation) => {
    variables[equation.name] = {
      ...(equation.desc ? { description: equation.desc } : {}),
      ...compactUnitFields(equation.unitMeta),
      ...(equation.role ? { role: equation.role } : {})
    };
  });
  parametersCell?.externals.forEach((external) => {
    variables[external.name] = {
      ...(external.desc ? { description: external.desc } : {}),
      ...compactUnitFields(external.unitMeta)
    };
  });
  return variables;
}

function compactUnitFields(unitMeta) {
  if (!unitMeta) {
    return {};
  }
  const unit = formatCompactUnit(unitMeta);
  return { ...(unit ? { unit } : { unitMeta }), ...(unitMeta.stockFlow ? { type: unitMeta.stockFlow } : {}) };
}

function buildCompactUnits(variables) {
  if (!variables) {
    return undefined;
  }
  let hasCurrency = false;
  let hasTime = false;
  let hasLabor = false;

  Object.values(variables).forEach((meta) => {
    const unit = typeof meta.unit === "string" ? meta.unit : "";
    hasCurrency ||= unit.includes("$");
    hasTime ||= /(?:^|\/)y(?:ea)?r$|1\/y(?:ea)?r/.test(unit);
    hasLabor ||= /items?/.test(unit);

    const unitMeta = isRecord(meta.unitMeta) ? meta.unitMeta : undefined;
    const signature = unitMeta ? compactUnitSignature(unitMeta) : undefined;
    hasCurrency ||= typeof signature?.money === "number";
    hasTime ||= typeof signature?.time === "number";
    hasLabor ||= typeof signature?.items === "number";
  });

  const units = {};
  if (hasCurrency) units.currency = "$";
  if (hasTime) units.time = "year";
  if (hasLabor) units.labor = "items";
  return Object.keys(units).length > 0 ? units : undefined;
}

function buildCompactSolverDescriptor(options) {
  return {
    ...(options.periods == null ? {} : { periods: options.periods }),
    method: options.solverMethod.toLowerCase().replace(/_/g, "-"),
    tolerance: options.toleranceText,
    maxIterations: options.maxIterations,
    defaultInitialValue: options.defaultInitialValueText,
    hiddenLeftVariable: options.hiddenLeftVariable,
    hiddenRightVariable: options.hiddenRightVariable,
    hiddenTolerance: options.hiddenToleranceText,
    relativeHiddenTolerance: options.relativeHiddenTolerance
  };
}

function buildCompactMatrixDescriptor(cell, options) {
  return {
    ...(options.preserveIds ? { id: cell.id } : {}),
    title: cell.title,
    ...(cell.description ? { description: cell.description } : {}),
    ...(cell.note ? { note: cell.note } : {}),
    columns: cell.columns,
    ...(cell.sectors ? { sectors: cell.sectors } : {}),
    rows: cell.rows.map((row) => (row.band == null ? { label: row.label, values: row.values } : [row.band, row.label, ...row.values]))
  };
}

function buildCompactChartDescriptor(cell, options) {
  return {
    ...(options.preserveIds ? { id: cell.id } : {}),
    title: cell.title,
    ...(cell.description ? { description: cell.description } : {}),
    ...(cell.note ? { note: cell.note } : {}),
    variables: cell.variables,
    ...(cell.axisMode ? { axisMode: cell.axisMode } : {}),
    ...(cell.axisSnapTolarance == null ? {} : { axisSnapTolarance: cell.axisSnapTolarance }),
    ...(cell.niceScale == null ? {} : { niceScale: cell.niceScale }),
    ...(cell.referenceTrace ? { referenceTrace: cell.referenceTrace } : {}),
    ...(cell.yAxisTickCount == null ? {} : { yAxisTickCount: cell.yAxisTickCount }),
    ...(cell.sharedRange ? { sharedRange: cell.sharedRange } : {}),
    ...(cell.seriesRanges ? { seriesRanges: cell.seriesRanges } : {}),
    ...(cell.timeRangeInclusive ? { timeRangeInclusive: cell.timeRangeInclusive } : {})
  };
}

function buildCompactTableDescriptor(cell, options) {
  return {
    ...(options.preserveIds ? { id: cell.id } : {}),
    title: cell.title,
    ...(cell.note ? { note: cell.note } : {}),
    ...(cell.description ? { description: cell.description } : {}),
    variables: cell.variables
  };
}

function rewriteCompactReferences(value, idMap, modelIdMap, key) {
  if (typeof value === "string") {
    if ((key === "modelId" || key === "sourceModelId") && modelIdMap.has(value)) {
      return modelIdMap.get(value);
    }
    return idMap.get(value) ?? value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => rewriteCompactReferences(entry, idMap, modelIdMap));
  }
  if (!isRecord(value)) {
    return value;
  }
  return Object.fromEntries(Object.entries(value).map(([entryKey, entry]) => [entryKey, rewriteCompactReferences(entry, idMap, modelIdMap, entryKey)]));
}

function scalarFromValueText(valueText) {
  if (valueText === "true") return true;
  if (valueText === "false") return false;
  const number = Number(valueText);
  return Number.isFinite(number) && String(number) === valueText.trim() ? number : valueText;
}

function formatCompactUnit(unitMeta) {
  const signature = compactUnitSignature(unitMeta);
  if (!signature) return undefined;
  const money = signature.money;
  const time = signature.time;
  const items = signature.items;
  if (Object.keys(signature).length === 0) return "1";
  if (money === 1 && time === -1 && items == null) return "$/year";
  if (money === 1 && time == null && items == null) return "$";
  if (time === -1 && money == null && items == null) return "1/year";
  if (items === 1 && time === -1 && money == null) return "items/year";
  if (money === 1 && items === -1 && time == null) return "$/item";
  if (time === 1 && money == null && items == null) return "year";
  return undefined;
}

async function readNotebookYaml(yamlPath) {
  const source = await fs.readFile(yamlPath, "utf8");
  if (/(^|\n)(\s*)(?:<<\s*:|[^\n#]*\s[&*][A-Za-z0-9_-]+(?:\s|$))/.test(source)) {
    throw new Error(`${path.relative(webRoot, yamlPath)}: anchors, aliases, and merge keys are not allowed.`);
  }

  const yamlDocument = parseDocument(source, {
    prettyErrors: false,
    uniqueKeys: true
  });
  if (yamlDocument.errors.length > 0) {
    const messages = yamlDocument.errors.map((error) => error.message).join("\n");
    throw new Error(`${path.relative(webRoot, yamlPath)}: YAML parse failed\n${messages}`);
  }

  const parsed = yamlDocument.toJSON();
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${path.relative(webRoot, yamlPath)}: notebook YAML must be an object.`);
  }
  if (parsed.format !== NOTEBOOK_YAML_FORMAT || parsed.formatVersion !== NOTEBOOK_YAML_FORMAT_VERSION) {
    throw new Error(
      `${path.relative(webRoot, yamlPath)}: expected format: ${NOTEBOOK_YAML_FORMAT} and formatVersion: ${NOTEBOOK_YAML_FORMAT_VERSION}.`
    );
  }

  const { format: _format, formatVersion: _formatVersion, ...document } = parsed;
  return compileYamlNotebookSource(document);
}

function compileYamlNotebookSource(source) {
  if (Array.isArray(source.cells) && typeof source.equations !== "string") {
    return source;
  }

  const id = stringValue(source.id, "notebook");
  const title = stringValue(source.title, id);
  const metadataInput = isRecord(source.metadata) ? source.metadata : {};
  const template = typeof metadataInput.template === "string" ? metadataInput.template : undefined;
  const modelId = typeof source.modelId === "string" ? source.modelId : template ? `${template}-model` : "main";
  const baselineRunInput = isRecord(source.baselineRun) ? source.baselineRun : {};
  const baselineRunCellId = stringValue(baselineRunInput.id, "baseline-run");
  const cells = [];
  const description = typeof metadataInput.description === "string" ? metadataInput.description.trim() : "";

  if (description) {
    const introCell = isRecord(source.introCell) ? source.introCell : {};
    cells.push({ id: compactCellId(introCell, "overview"), type: "markdown", title: compactCellTitle(introCell, "Overview"), source: description });
  }

  const balanceCell = buildCompactMatrixCell(source.balance, {
    fallbackColumns: source.sectors,
    id: "balance-sheet",
    sourceRunCellId: baselineRunCellId,
    title: "Balance sheet"
  });
  if (balanceCell) {
    cells.push(balanceCell);
  }

  const transactionsCell = buildCompactMatrixCell(source.transactions, {
    fallbackColumns: source.sectors,
    id: "transactions-flow",
    sourceRunCellId: baselineRunCellId,
    title: "Transactions-flow matrix"
  });
  if (transactionsCell) {
    cells.push(transactionsCell);
  }

  cells.push({
    id: compactCellId(source.equationCell, `equations-${modelId}`),
    type: "equations",
    title: compactCellTitle(source.equationCell, "Equations"),
    modelId,
    equations: parseCompactEquations(source.equations, source.variables),
    ...compactCellFlags(source.equationCell)
  });

  const parameters = buildCompactParameters(source.parameters, source.variables);
  if (parameters.length > 0 || isRecord(source.parametersCell)) {
    cells.push({
      id: compactCellId(source.parametersCell, `parameters-${modelId}`),
      type: "externals",
      title: compactCellTitle(source.parametersCell, "Parameters"),
      modelId,
      externals: parameters,
      ...compactCellFlags(source.parametersCell)
    });
  }

  const initialValues = buildCompactInitialValues(source["initial-values"]);
  if (initialValues.length > 0 || isRecord(source.initialValuesCell)) {
    cells.push({
      id: compactCellId(source.initialValuesCell, `initial-values-${modelId}`),
      type: "initial-values",
      title: compactCellTitle(source.initialValuesCell, "Initial values"),
      modelId,
      initialValues,
      ...compactCellFlags(source.initialValuesCell)
    });
  }

  const solverOptions = buildCompactSolverOptions(source.solver);
  cells.push({
    id: compactCellId(source.solverCell, `solver-${modelId}`),
    type: "solver",
    title: compactCellTitle(source.solverCell, "Solver options"),
    modelId,
    options: solverOptions,
    ...compactCellFlags(source.solverCell)
  });
  cells.push({
    id: baselineRunCellId,
    type: "run",
    title: stringValue(baselineRunInput.title, "Baseline run"),
    ...(typeof baselineRunInput.note === "string" ? { note: baselineRunInput.note } : {}),
    ...(typeof baselineRunInput.description === "string" ? { description: baselineRunInput.description } : {}),
    mode: "baseline",
    periods: numberValue(baselineRunInput.periods, numberValue(source.solver?.periods, 50)),
    resultKey: stringValue(baselineRunInput.resultKey, "baseline"),
    sourceModelId: modelId,
    ...(typeof baselineRunInput.baselineStartPeriod === "number" ? { baselineStartPeriod: baselineRunInput.baselineStartPeriod } : {})
  });
  cells.push(...buildCompactChartCells(source.charts, baselineRunCellId));
  cells.push(...buildCompactTableCells(source.tables, baselineRunCellId));

  if (typeof source.notes === "string" && source.notes.trim()) {
    cells.push({ id: "notes", type: "markdown", title: "Notes", source: source.notes.trim() });
  }

  if (Array.isArray(source.cells)) {
    cells.push(...source.cells);
  }

  return {
    id,
    title,
    metadata: { version: 1, ...(template ? { template } : {}) },
    cells: orderCompactCells(cells, source.cellOrder)
  };
}

function compactCellId(input, fallback) {
  return isRecord(input) && typeof input.id === "string" ? input.id : fallback;
}

function compactCellTitle(input, fallback) {
  return isRecord(input) && typeof input.title === "string" ? input.title : fallback;
}

function compactCellFlags(input) {
  if (!isRecord(input)) {
    return {};
  }
  return {
    ...(typeof input.collapsed === "boolean" ? { collapsed: input.collapsed } : {}),
    ...(typeof input.description === "string" ? { description: input.description } : {}),
    ...(typeof input.note === "string" ? { note: input.note } : {})
  };
}

function orderCompactCells(cells, cellOrder) {
  if (!Array.isArray(cellOrder)) {
    return cells;
  }
  const cellsById = new Map(cells.map((cell) => [cell.id, cell]));
  const orderedIds = new Set();
  const orderedCells = cellOrder.flatMap((entry) => {
    const id = String(entry);
    const cell = cellsById.get(id);
    if (!cell) {
      return [];
    }
    orderedIds.add(id);
    return [cell];
  });
  return [...orderedCells, ...cells.filter((cell) => !orderedIds.has(cell.id))];
}

function parseCompactEquations(source, variables) {
  const variableMeta = isRecord(variables) ? variables : {};
  return source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line, index) => {
      const match = line.match(/^([A-Za-z_][\w^{}.]*)\s*(?:~|=)\s*(.+)$/);
      if (!match) {
        throw new Error(`Invalid compact equation line: ${line}`);
      }
      const name = match[1];
      const meta = isRecord(variableMeta[name]) ? variableMeta[name] : {};
      return {
        id: `eq-${index}-${slugifyIdentifier(name)}`,
        name,
        ...(typeof meta.description === "string" ? { desc: meta.description } : {}),
        expression: match[2].trim(),
        ...(resolveEquationRole(meta) ? { role: resolveEquationRole(meta) } : {}),
        ...(buildUnitMeta(meta) ? { unitMeta: buildUnitMeta(meta) } : {})
      };
    });
}

function buildCompactParameters(parameters, variables) {
  if (!isRecord(parameters)) {
    return [];
  }
  const variableMeta = isRecord(variables) ? variables : {};
  return Object.entries(parameters).map(([name, value], index) => {
    const meta = isRecord(variableMeta[name]) ? variableMeta[name] : {};
    return {
      id: `ext-${index}-${slugifyIdentifier(name)}`,
      name,
      ...(typeof meta.description === "string" ? { desc: meta.description } : {}),
      kind: "constant",
      valueText: String(value),
      ...(buildUnitMeta(meta) ? { unitMeta: buildUnitMeta(meta) } : {})
    };
  });
}

function buildCompactInitialValues(initialValues) {
  if (!isRecord(initialValues)) {
    return [];
  }
  return Object.entries(initialValues).map(([name, value], index) => ({
    id: `init-${index}-${slugifyIdentifier(name)}`,
    name,
    valueText: String(value)
  }));
}

function buildCompactMatrixCell(input, options) {
  if (!isRecord(input)) {
    return null;
  }
  const columns = stringArray(input.columns) ?? stringArray(options.fallbackColumns) ?? [];
  const sectors = stringArray(input.sectors);
  const rows = Array.isArray(input.rows)
    ? input.rows.map((row) => {
        if (Array.isArray(row)) {
          const [band, label, ...values] = row;
          return { band: String(band), label: String(label), values: values.map((value) => String(value)) };
        }
        if (isRecord(row)) {
          return { ...(typeof row.band === "string" ? { band: row.band } : {}), label: stringValue(row.label, ""), values: stringArray(row.values) ?? [] };
        }
        throw new Error("Compact matrix rows must be arrays or row objects.");
      })
    : [];
  return {
    id: typeof input.id === "string" ? input.id : options.id,
    type: "matrix",
    title: typeof input.title === "string" ? input.title : options.title,
    sourceRunCellId: options.sourceRunCellId,
    columns,
    ...(sectors ? { sectors } : {}),
    rows,
    ...compactCellFlags(input)
  };
}

function buildCompactSolverOptions(input) {
  const solver = isRecord(input) ? input : {};
  return {
    ...(solver.periods == null ? {} : { periods: numberValue(solver.periods, 50) }),
    solverMethod: normalizeSolverMethod(solver.method ?? solver.solverMethod),
    toleranceText: stringValue(solver.tolerance ?? solver.toleranceText, "1e-6"),
    maxIterations: numberValue(solver.maxIterations, 200),
    defaultInitialValueText: stringValue(solver.defaultInitialValue ?? solver.defaultInitialValueText, "1e-15"),
    hiddenLeftVariable: stringValue(solver.hiddenLeftVariable, ""),
    hiddenRightVariable: stringValue(solver.hiddenRightVariable, ""),
    hiddenToleranceText: stringValue(solver.hiddenTolerance ?? solver.hiddenToleranceText, "0.00001"),
    relativeHiddenTolerance: Boolean(solver.relativeHiddenTolerance)
  };
}

function buildCompactChartCells(charts, sourceRunCellId) {
  if (!Array.isArray(charts)) {
    return [];
  }
  return charts.filter(isRecord).map((chart, index) => ({
    id: typeof chart.id === "string" ? chart.id : `chart-${index + 1}`,
    type: "chart",
    title: typeof chart.title === "string" ? chart.title : `Chart ${index + 1}`,
    ...compactCellFlags(chart),
    sourceRunCellId,
    variables: stringArray(chart.variables) ?? [],
    ...(chart.axisMode === "shared" || chart.axisMode === "separate" ? { axisMode: chart.axisMode } : {}),
    ...(typeof chart.axisSnapTolarance === "number" ? { axisSnapTolarance: chart.axisSnapTolarance } : {}),
    ...(typeof chart.niceScale === "boolean" ? { niceScale: chart.niceScale } : {}),
    ...(chart.referenceTrace === "none" || chart.referenceTrace === "baseline" || chart.referenceTrace === "previous-run" ? { referenceTrace: chart.referenceTrace } : {}),
    ...(typeof chart.yAxisTickCount === "number" ? { yAxisTickCount: chart.yAxisTickCount } : {}),
    ...(isRecord(chart.sharedRange) ? { sharedRange: chart.sharedRange } : {}),
    ...(isRecord(chart.seriesRanges) ? { seriesRanges: chart.seriesRanges } : {}),
    ...(Array.isArray(chart.timeRangeInclusive) ? { timeRangeInclusive: chart.timeRangeInclusive } : {})
  }));
}

function buildCompactTableCells(tables, sourceRunCellId) {
  if (!Array.isArray(tables)) {
    return [];
  }
  return tables.filter(isRecord).map((table, index) => ({
    id: typeof table.id === "string" ? table.id : `table-${index + 1}`,
    type: "table",
    title: typeof table.title === "string" ? table.title : `Table ${index + 1}`,
    ...(typeof table.note === "string" ? { note: table.note } : {}),
    ...(typeof table.description === "string" ? { description: table.description } : {}),
    ...(typeof table.collapsed === "boolean" ? { collapsed: table.collapsed } : {}),
    sourceRunCellId,
    variables: stringArray(table.variables) ?? []
  }));
}

function resolveEquationRole(meta) {
  if (typeof meta.role === "string") {
    return meta.role;
  }
  if (meta.type === "stock") {
    return "accumulation";
  }
  if (meta.type === "flow") {
    return "identity";
  }
  return undefined;
}

function buildUnitMeta(meta) {
  const unit = typeof meta.unit === "string" ? meta.unit : undefined;
  if (isRecord(meta.unitMeta)) {
    return meta.unitMeta;
  }
  const stockFlow = meta.type === "stock" || meta.type === "flow" || meta.type === "aux" ? meta.type : undefined;
  const signature = unit ? parseCompactUnit(unit) : undefined;
  if (!stockFlow && !signature) {
    return undefined;
  }
  return { ...(stockFlow ? { stockFlow } : {}), ...(signature ? { signature } : {}) };
}

function parseCompactUnit(unit) {
  const normalized = unit.trim();
  if (!normalized || normalized === "1") {
    return undefined;
  }
  if (normalized === "$") {
    return { money: 1 };
  }
  if (normalized === "$/year" || normalized === "$/yr") {
    return { money: 1, time: -1 };
  }
  if (normalized === "1/year" || normalized === "1/yr") {
    return { time: -1 };
  }
  if (normalized === "items/year" || normalized === "items/yr") {
    return { items: 1, time: -1 };
  }
  if (normalized === "$/item" || normalized === "$/items") {
    return { money: 1, items: -1 };
  }
  if (normalized === "year" || normalized === "yr") {
    return { time: 1 };
  }
  return undefined;
}

function compactUnitSignature(unitMeta) {
  if (!isRecord(unitMeta)) return undefined;
  if (isRecord(unitMeta.signature)) {
    return Object.fromEntries(Object.entries(unitMeta.signature).filter(([, value]) => typeof value === "number"));
  }
  const units = isRecord(unitMeta.units) ? unitMeta.units : undefined;
  if (!units) return undefined;
  return {
    ...(typeof units.$ === "number" ? { money: units.$ } : {}),
    ...(typeof units.money === "number" ? { money: units.money } : {}),
    ...(typeof units.yr === "number" ? { time: units.yr } : {}),
    ...(typeof units.time === "number" ? { time: units.time } : {}),
    ...(typeof units.items === "number" ? { items: units.items } : {})
  };
}

function normalizeSolverMethod(value) {
  const normalized = typeof value === "string" ? value.toUpperCase().replace(/-/g, "_") : "NEWTON";
  return normalized === "GAUSS_SEIDEL" || normalized === "BROYDEN" || normalized === "NEWTON" ? normalized : "NEWTON";
}

function isRecord(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function stringArray(value) {
  return Array.isArray(value) ? value.map((entry) => String(entry)) : null;
}

function stringValue(value, fallback) {
  return value == null ? fallback : String(value);
}

function numberValue(value, fallback) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function slugifyIdentifier(value) {
  return value.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "value";
}

function validateNotebookJson(document, yamlPath) {
  if (validateSchema(document)) {
    return;
  }

  const messages = (validateSchema.errors ?? [])
    .map((error) => `${error.instancePath || "/"}: ${error.message ?? error.keyword}`)
    .join("\n");
  throw new Error(`${path.relative(webRoot, yamlPath)}: compiled JSON failed schema validation\n${messages}`);
}

async function assertFileMatches(filePath, expected) {
  let actual;
  try {
    actual = await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      throw new Error(`${path.relative(webRoot, filePath)} is missing. Run with --write to generate it.`);
    }
    throw error;
  }

  if (actual !== expected) {
    throw new Error(`${path.relative(webRoot, filePath)} is stale. Run with --write to update it.`);
  }
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

  const entries = Object.entries(value).filter(([, entryValue]) => entryValue !== undefined);
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
        `${childIndentation}${JSON.stringify(key)}: ${stringifyJsonWithCompactLeaves(entryValue, level + 1)}`
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

  const entries = Object.entries(value).filter(([, entryValue]) => entryValue !== undefined);
  if (entries.length === 0) {
    return "{}";
  }

  return `{ ${entries
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

  return Object.values(value).every((entry) => isInlineJsonValue(entry));
}

function isPrimitiveJsonValue(value) {
  return value == null || typeof value !== "object";
}
