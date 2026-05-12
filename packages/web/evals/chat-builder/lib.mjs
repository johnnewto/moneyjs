import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const webRoot = path.resolve(__dirname, "../..");
export const evalRoot = path.resolve(webRoot, "evals/chat-builder");

const DEFAULT_DISCOVERY_PATH = path.resolve(webRoot, "public/.well-known/sfcr.json");
const DEFAULT_SCHEMA_PATH = path.resolve(webRoot, "public/sfcr-notebook.schema.json");
const DEFAULT_ARTIFACT_ROOT = path.resolve(webRoot, "eval-runs/chat-builder");
const DEFAULT_LIVE_ORIGIN = "http://localhost:5173";
const IDENTIFIER_PATTERN = /[A-Za-z][A-Za-z0-9_^{}]*/g;
const FUNCTION_NAMES = new Set(["abs", "d", "exp", "lag", "log", "max", "min", "pow", "sqrt"]);

export async function listFixtures() {
  const fixtureDir = path.resolve(evalRoot, "fixtures");
  const entries = await fs.readdir(fixtureDir);
  return entries.filter((entry) => entry.endsWith(".json")).map((entry) => path.basename(entry, ".json"));
}

export async function loadFixture(id) {
  return readJson(path.resolve(evalRoot, "fixtures", `${id}.json`));
}

export async function runChatBuilderEval(options = {}) {
  const progress = createProgressReporter(options);
  progress("start", `fixture=${options.fixtureId ?? "sim-basic"} mode=${options.live ? "live" : "offline"}`);
  const fixture = await loadFixture(options.fixtureId ?? "sim-basic");
  progress("fixture", `label=${fixture.label} promptChars=${fixture.prompt.length}`);
  const discovery = await readJson(options.discoveryPath ?? DEFAULT_DISCOVERY_PATH);
  const schema = await readJson(options.schemaPath ?? DEFAULT_SCHEMA_PATH);
  const examples = await loadDiscoveryExamples(discovery, options.discoveryPath ?? DEFAULT_DISCOVERY_PATH);
  progress("resources", `examples=${examples.length} schema=${schema.title ?? "loaded"}`);
  const retrieval = rankExamples({ examples, fixture, prompt: fixture.prompt });
  progress("retrieval", `selected=${retrieval.selectedExamples.map((example) => `${example.id}:${example.score}`).join(",")}`);

  const liveRequest = {
    betaPassword: options.betaPassword ?? process.env.EVAL_CHAT_BUILDER_BETA_PASSWORD ?? "",
    discoveryUrl: options.discoveryUrl ?? process.env.EVAL_DISCOVERY_URL ?? "http://localhost:5173/.well-known/sfcr.json",
    endpoint: options.endpoint ?? process.env.EVAL_CHAT_BUILDER_API_URL ?? process.env.VITE_CHAT_BUILDER_API_URL ?? "http://localhost:8787/v1/chat-builder/draft",
    model: options.model ?? process.env.EVAL_OPENAI_MODEL ?? "gpt-4.1",
    origin: options.origin ?? process.env.EVAL_ORIGIN ?? DEFAULT_LIVE_ORIGIN,
    prompt: fixture.prompt
  };
  progress(
    "request",
    options.live
      ? `endpoint=${liveRequest.endpoint} model=${liveRequest.model} origin=${liveRequest.origin} prompt="${summarizeText(fixture.prompt)}"`
      : `savedResponse=${fixture.savedResponsePath} prompt="${summarizeText(fixture.prompt)}"`
  );

  const rawResponse = options.live
    ? await requestLiveDraft(liveRequest)
    : await readText(resolveEvalPath(fixture.savedResponsePath));
  progress("response", `chars=${rawResponse.length} preview="${summarizeText(rawResponse)}"`);

  const draft = parseDraftResponse(rawResponse);
  progress("parse", draft.ok ? `ok title="${draft.document.title}" cells=${draft.document.cells?.length ?? 0}` : `failed ${draft.error}`);
  const semanticIndex = draft.ok ? buildSemanticNotebookIndex(draft.document) : null;
  const validation = draft.ok
    ? validateNotebookDraft({ document: draft.document, expected: fixture.expected, schema })
    : {
        ok: false,
        diagnostics: [{ phase: "parse", message: draft.error }],
        metrics: {}
      };
  progress("validation", `ok=${validation.ok} diagnostics=${validation.diagnostics.length}`);

  const summary = {
    fixtureId: fixture.id,
    label: fixture.label,
    live: Boolean(options.live),
    ok: validation.ok,
    diagnosticsCount: validation.diagnostics.length,
    request: buildRequestSummary({ fixture, live: Boolean(options.live), liveRequest }),
    response: buildResponseSummary({ draft, rawResponse }),
    selectedExamples: retrieval.selectedExamples.map((example) => ({ id: example.id, score: example.score, reasons: example.reasons })),
    metrics: validation.metrics
  };

  const artifactDir = options.artifactDir ?? buildArtifactDir(fixture.id, Boolean(options.live));
  await writeArtifacts(artifactDir, {
    "fixture.json": fixture,
    "retrieval.json": retrieval,
    "semantic-index.json": semanticIndex ?? { error: "Draft did not parse." },
    "draft.raw.txt": rawResponse,
    "draft.json": draft.ok ? draft.document : { error: draft.error },
    "validation.json": validation,
    "summary.json": summary
  });
  progress("artifacts", artifactDir);

  return { artifactDir, draft, fixture, retrieval, semanticIndex, summary, validation };
}

export function buildSemanticNotebookIndex(document) {
  const cells = Array.isArray(document.cells) ? document.cells : [];
  const models = new Map();
  const runs = [];
  const charts = [];
  const tables = [];
  const matrices = [];

  for (const cell of cells) {
    if (!cell || typeof cell !== "object") {
      continue;
    }
    if ("modelId" in cell && typeof cell.modelId === "string") {
      const model = models.get(cell.modelId) ?? createEmptyModelSummary(cell.modelId);
      models.set(cell.modelId, model);
      if (cell.type === "equations") {
        model.equations = (cell.equations ?? []).map((equation) => summarizeEquation(equation));
      }
      if (cell.type === "externals") {
        model.externals = (cell.externals ?? []).map((external) => external.name).filter(Boolean);
      }
      if (cell.type === "initial-values") {
        model.initialValues = (cell.initialValues ?? []).map((initialValue) => initialValue.name).filter(Boolean);
      }
      if (cell.type === "solver") {
        model.solver = cell.options ?? null;
      }
    }
    if (cell.type === "run") {
      runs.push({
        title: cell.title,
        mode: cell.mode,
        sourceModelId: cell.sourceModelId ?? null,
        hasScenario: Boolean(cell.scenario),
        periods: cell.periods ?? null
      });
    }
    if (cell.type === "chart") {
      charts.push({ title: cell.title, variables: cell.variables ?? [] });
    }
    if (cell.type === "table") {
      tables.push({ title: cell.title, variables: cell.variables ?? [] });
    }
    if (cell.type === "matrix") {
      matrices.push({ title: cell.title, columns: cell.columns ?? [], sectors: cell.sectors ?? [], rowCount: cell.rows?.length ?? 0 });
    }
  }

  const modelSummaries = Array.from(models.values()).map((model) => ({
    ...model,
    variables: Array.from(new Set([...model.equations.map((equation) => equation.name), ...model.externals])).sort()
  }));
  const cellTypes = countBy(cells.map((cell) => cell.type).filter(Boolean));
  const featureTags = [
    matrices.length > 0 ? "matrices" : null,
    runs.some((run) => run.mode === "baseline") ? "baseline" : null,
    runs.some((run) => run.mode === "scenario") ? "scenario" : null,
    charts.length > 0 ? "charts" : null,
    tables.length > 0 ? "tables" : null
  ].filter(Boolean);

  return {
    id: document.id,
    title: document.title,
    cellCount: cells.length,
    cellTypes,
    featureTags,
    models: modelSummaries,
    runs,
    charts,
    tables,
    matrices
  };
}

export function validateNotebookDraft({ document, expected = {}, schema }) {
  const diagnostics = [];
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validateSchema = ajv.compile(schema);
  const schemaOk = validateSchema(document);
  if (!schemaOk) {
    for (const error of validateSchema.errors ?? []) {
      diagnostics.push({
        phase: "schema",
        path: error.instancePath || "/",
        message: error.message ?? `failed schema rule ${error.keyword}`
      });
    }
  }

  diagnostics.push(...validateReferences(document));
  diagnostics.push(...validateExpected(document, expected));

  return {
    ok: diagnostics.length === 0,
    diagnostics,
    metrics: buildMetrics(document, diagnostics)
  };
}

export function parseDraftResponse(rawResponse) {
  const trimmed = rawResponse.trim();
  const sseFailure = extractSseFailure(trimmed);
  if (sseFailure) {
    return { ok: false, error: sseFailure };
  }
  const candidates = [trimmed, extractFirstJsonObject(trimmed)].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const document = JSON.parse(candidate);
      return { ok: true, document };
    } catch {
      // Try the next candidate.
    }
  }
  return { ok: false, error: "Response did not contain a parseable JSON notebook document." };
}

export function rankExamples({ examples, fixture, prompt }) {
  const promptTokens = tokenize([prompt, ...(fixture.expected?.variables ?? []), ...(fixture.expected?.cellTypes ?? [])].join(" "));
  const scored = examples.map((example) => {
    const index = buildSemanticNotebookIndex(example.document);
    const searchableText = [
      example.id,
      example.label,
      example.focus?.join(" "),
      index.title,
      index.featureTags.join(" "),
      ...Object.keys(index.cellTypes),
      ...index.models.flatMap((model) => model.variables)
    ].join(" ");
    const tokens = tokenize(searchableText);
    const overlap = [...promptTokens].filter((token) => tokens.has(token));
    const reasons = overlap.slice(0, 8).map((token) => `matched:${token}`);
    if (fixture.expected?.runModes?.includes("scenario") && index.runs.some((run) => run.mode === "scenario")) {
      reasons.push("has:scenario");
    }
    if (fixture.expected?.cellTypes?.includes("matrix") && index.matrices.length > 0) {
      reasons.push("has:matrix");
    }
    return {
      id: example.id,
      label: example.label,
      url: example.url,
      focus: example.focus ?? [],
      score: overlap.length + reasons.filter((reason) => reason.startsWith("has:")).length * 2,
      reasons,
      semanticSummary: {
        title: index.title,
        cellTypes: index.cellTypes,
        featureTags: index.featureTags,
        variables: index.models.flatMap((model) => model.variables).slice(0, 40)
      }
    };
  });

  scored.sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
  return {
    query: prompt,
    selectedExamples: scored.slice(0, 3),
    candidates: scored
  };
}

async function loadDiscoveryExamples(discovery, discoveryPath) {
  const entries = discovery.resources?.notebooks?.examples ?? [];
  const examples = [];
  for (const entry of entries) {
    if (!entry.url) {
      continue;
    }
    const resolved = resolveResourcePath(discoveryPath, entry.url);
    try {
      const document = await readJson(resolved);
      examples.push({ ...entry, document });
    } catch (error) {
      examples.push({ ...entry, document: { id: entry.id, title: `Failed to load ${entry.url}`, cells: [], metadata: { version: 1 } }, loadError: error.message });
    }
  }
  return examples;
}

function validateReferences(document) {
  const diagnostics = [];
  const cells = Array.isArray(document.cells) ? document.cells : [];
  const cellIds = new Set();
  const duplicateIds = new Set();
  const modelIds = new Set();
  const runIds = new Set();
  const matrixIds = new Set();

  for (const cell of cells) {
    if (cellIds.has(cell.id)) {
      duplicateIds.add(cell.id);
    }
    cellIds.add(cell.id);
    if (["equations", "solver", "externals", "initial-values"].includes(cell.type) && cell.modelId) {
      modelIds.add(cell.modelId);
    }
    if (cell.type === "run") {
      runIds.add(cell.id);
    }
    if (cell.type === "matrix") {
      matrixIds.add(cell.id);
    }
  }

  for (const id of duplicateIds) {
    diagnostics.push({ phase: "references", message: `Duplicate cell id '${id}'.` });
  }

  for (const cell of cells) {
    if (cell.type === "run") {
      if (cell.sourceModelId && !modelIds.has(cell.sourceModelId)) {
        diagnostics.push({ phase: "references", message: `Run '${cell.title}' references unknown model '${cell.sourceModelId}'.` });
      }
      if (cell.baselineRunCellId && !runIds.has(cell.baselineRunCellId)) {
        diagnostics.push({ phase: "references", message: `Scenario run '${cell.title}' references an unknown baseline run.` });
      }
    }
    if (["chart", "table", "matrix"].includes(cell.type) && cell.sourceRunCellId && !runIds.has(cell.sourceRunCellId)) {
      diagnostics.push({ phase: "references", message: `${cell.type} '${cell.title}' references an unknown run.` });
    }
    if (cell.type === "sequence" && cell.source?.kind === "matrix" && !matrixIds.has(cell.source.matrixCellId)) {
      diagnostics.push({ phase: "references", message: `Sequence '${cell.title}' references an unknown matrix.` });
    }
  }
  return diagnostics;
}

function validateExpected(document, expected) {
  const diagnostics = [];
  const cells = Array.isArray(document.cells) ? document.cells : [];
  const cellTypes = new Set(cells.map((cell) => cell.type));
  const equations = cells.filter((cell) => cell.type === "equations").flatMap((cell) => cell.equations ?? []);
  const externals = cells.filter((cell) => cell.type === "externals").flatMap((cell) => cell.externals ?? []);
  const runs = cells.filter((cell) => cell.type === "run");

  if (expected.titleIncludes && !String(document.title ?? "").toLowerCase().includes(expected.titleIncludes.toLowerCase())) {
    diagnostics.push({ phase: "expected", message: `Notebook title should include '${expected.titleIncludes}'.` });
  }
  for (const cellType of expected.cellTypes ?? []) {
    if (!cellTypes.has(cellType)) {
      diagnostics.push({ phase: "expected", message: `Expected cell type '${cellType}'.` });
    }
  }
  for (const variable of expected.variables ?? []) {
    if (!equations.some((equation) => equation.name === variable)) {
      diagnostics.push({ phase: "expected", message: `Expected equation variable '${variable}'.` });
    }
  }
  for (const external of expected.externals ?? []) {
    if (!externals.some((entry) => entry.name === external)) {
      diagnostics.push({ phase: "expected", message: `Expected external variable '${external}'.` });
    }
  }
  for (const mode of expected.runModes ?? []) {
    if (!runs.some((run) => run.mode === mode)) {
      diagnostics.push({ phase: "expected", message: `Expected ${mode} run.` });
    }
  }
  if (expected.scenarioShock) {
    const shock = runs.flatMap((run) => run.scenario?.shocks ?? []).find((candidate) => {
      const range = candidate.rangeInclusive ?? [candidate.startPeriodInclusive, candidate.endPeriodInclusive];
      return range[0] === expected.scenarioShock.rangeInclusive[0] &&
        range[1] === expected.scenarioShock.rangeInclusive[1] &&
        candidate.variables?.[expected.scenarioShock.variable]?.value === expected.scenarioShock.value;
    });
    if (!shock) {
      diagnostics.push({ phase: "expected", message: `Expected scenario shock for '${expected.scenarioShock.variable}'.` });
    }
  }
  return diagnostics;
}

function buildMetrics(document, diagnostics) {
  const index = buildSemanticNotebookIndex(document);
  return {
    cellCount: index.cellCount,
    cellTypes: index.cellTypes,
    featureTags: index.featureTags,
    modelCount: index.models.length,
    runCount: index.runs.length,
    diagnosticPhases: countBy(diagnostics.map((diagnostic) => diagnostic.phase))
  };
}

function summarizeEquation(equation) {
  const expression = equation.expression ?? "";
  const lagDependencies = Array.from(expression.matchAll(/lag\(([^)]+)\)/g), (match) => match[1]?.trim()).filter(Boolean);
  const identifiers = Array.from(expression.matchAll(IDENTIFIER_PATTERN), (match) => match[0])
    .filter((name) => !FUNCTION_NAMES.has(name) && name !== equation.name);
  const currentDependencies = Array.from(new Set(identifiers.filter((name) => !lagDependencies.includes(name))));
  return {
    name: equation.name,
    expression,
    role: equation.role ?? null,
    currentDependencies,
    lagDependencies: Array.from(new Set(lagDependencies))
  };
}

function createEmptyModelSummary(modelId) {
  return { modelId, equations: [], externals: [], initialValues: [], solver: null };
}

function tokenize(text) {
  return new Set(String(text).toLowerCase().match(/[a-z][a-z0-9_^{}-]*/g) ?? []);
}

function countBy(values) {
  return values.reduce((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function createProgressReporter(options) {
  if (typeof options.onProgress === "function") {
    return options.onProgress;
  }
  if (options.progress === true || process.env.EVAL_CHAT_BUILDER_PROGRESS === "1") {
    return (stage, message) => console.info(`[chat-builder-eval:${stage}] ${message}`);
  }
  return () => {};
}

function buildRequestSummary({ fixture, live, liveRequest }) {
  if (live) {
    return {
      mode: "live",
      endpoint: liveRequest.endpoint,
      model: liveRequest.model,
      origin: liveRequest.origin,
      discoveryUrl: liveRequest.discoveryUrl,
      promptChars: fixture.prompt.length,
      promptPreview: summarizeText(fixture.prompt)
    };
  }
  return {
    mode: "offline",
    savedResponsePath: fixture.savedResponsePath,
    promptChars: fixture.prompt.length,
    promptPreview: summarizeText(fixture.prompt)
  };
}

function buildResponseSummary({ draft, rawResponse }) {
  return {
    chars: rawResponse.length,
    preview: summarizeText(rawResponse),
    parsed: draft.ok,
    title: draft.ok ? draft.document.title ?? null : null,
    cellCount: draft.ok && Array.isArray(draft.document.cells) ? draft.document.cells.length : null,
    error: draft.ok ? null : draft.error
  };
}

function summarizeText(text, maxLength = 160) {
  const singleLine = String(text).replace(/\s+/g, " ").trim();
  return singleLine.length > maxLength ? `${singleLine.slice(0, maxLength - 1)}...` : singleLine;
}

function extractFirstJsonObject(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }
  return text.slice(start, end + 1);
}

function extractSseFailure(text) {
  if (!text.includes("data:")) {
    return null;
  }
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith("data:")) {
      continue;
    }
    const payload = line.slice("data:".length).trim();
    if (!payload || payload === "[DONE]") {
      continue;
    }
    try {
      const event = JSON.parse(payload);
      const error = event.type === "error" ? event.error : event.type === "response.failed" ? event.response?.error : null;
      if (error) {
        const code = error.code ?? error.type ?? "unknown_error";
        const message = error.message ?? "OpenAI stream failed before returning notebook JSON.";
        return `Live response failed (${code}): ${message}`;
      }
    } catch {
      // Ignore non-JSON SSE data.
    }
  }
  return null;
}

async function requestLiveDraft({ betaPassword, discoveryUrl, endpoint, model, origin, prompt }) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin
    },
    body: JSON.stringify({
      ...(betaPassword.trim() ? { betaPassword: betaPassword.trim() } : {}),
      discoveryUrl,
      messages: [],
      model,
      prompt
    })
  });
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`Live eval request failed (${response.status}): ${raw}`);
  }
  return parseSseOutputText(raw) || raw;
}

function parseSseOutputText(raw) {
  let output = "";
  for (const line of raw.split(/\r?\n/)) {
    if (!line.startsWith("data:")) {
      continue;
    }
    const payload = line.slice("data:".length).trim();
    if (!payload || payload === "[DONE]") {
      continue;
    }
    try {
      const event = JSON.parse(payload);
      if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
        output += event.delta;
      }
    } catch {
      // Ignore non-JSON SSE data.
    }
  }
  return output.trim();
}

async function writeArtifacts(artifactDir, artifacts) {
  await fs.mkdir(artifactDir, { recursive: true });
  for (const [filename, value] of Object.entries(artifacts)) {
    const filePath = path.resolve(artifactDir, filename);
    const content = typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`;
    await fs.writeFile(filePath, content, "utf8");
  }
}

function buildArtifactDir(fixtureId, live) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.resolve(DEFAULT_ARTIFACT_ROOT, `${timestamp}-${fixtureId}-${live ? "live" : "offline"}`);
}

function resolveEvalPath(relativePath) {
  return path.resolve(evalRoot, relativePath);
}

function resolveResourcePath(basePath, resourceUrl) {
  if (/^https?:\/\//.test(resourceUrl)) {
    throw new Error(`Cannot load remote resource in offline mode: ${resourceUrl}`);
  }
  return path.resolve(path.dirname(basePath), resourceUrl);
}

async function readJson(filePath) {
  return JSON.parse(await readText(filePath));
}

async function readText(filePath) {
  return fs.readFile(filePath, "utf8");
}
