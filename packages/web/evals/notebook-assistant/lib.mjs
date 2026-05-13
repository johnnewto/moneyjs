import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const webRoot = path.resolve(__dirname, "../..");
export const evalRoot = path.resolve(webRoot, "evals/notebook-assistant");

const DEFAULT_ARTIFACT_ROOT = path.resolve(webRoot, "eval-runs/notebook-assistant");

let evaluatorModulePromise = null;

export async function listFixtures() {
  const fixtureDir = path.resolve(evalRoot, "fixtures");
  const entries = await fs.readdir(fixtureDir);
  return entries.filter((entry) => entry.endsWith(".json")).map((entry) => path.basename(entry, ".json"));
}

export async function loadFixture(id) {
  return readJson(path.resolve(evalRoot, "fixtures", `${id}.json`));
}

export async function runNotebookAssistantEval(options = {}) {
  const progress = createProgressReporter(options);
  const fixtureId = options.fixtureId ?? "ask-list-runs";
  progress("start", `fixture=${fixtureId} mode=${options.live ? "live" : "offline"}`);
  if (options.live) {
    throw new Error("Notebook assistant CLI live eval is not implemented yet; use the local Assistant panel live tests or offline saved responses.");
  }

  const fixture = await loadFixture(fixtureId);
  progress("fixture", `label=${fixture.label} assistantMode=${fixture.mode}`);
  const document = await loadNotebookDocument(fixture);
  progress("snapshot", `title=\"${document.title ?? document.id}\" cells=${document.cells?.length ?? 0}`);
  const rawResponse = await readText(resolveEvalPath(fixture.savedResponsePath));
  progress("response", `chars=${rawResponse.length} preview=\"${summarizeText(rawResponse)}\"`);

  const evaluator = await loadEvaluatorModule();
  const evaluated = evaluator.evaluateNotebookAssistantResponse({ document, fixture, rawResponse });
  progress(
    "tools",
    `requested=${evaluated.extraction.requests.length} allowed=${evaluated.modeFiltered.allowed.length} blocked=${evaluated.modeFiltered.blocked.length}`
  );
  progress("patch", evaluated.patch ? `operations=${evaluated.patch.operations.length}` : "none");
  progress(
    "validation",
    evaluated.patch ? `ok=${evaluated.validation?.ok ?? false} previewOk=${evaluated.preview?.ok ?? false}` : "no patch"
  );
  progress("scoring", `ok=${evaluated.scoring.ok} diagnostics=${evaluated.scoring.diagnostics.length}`);

  const artifactDir = options.artifactDir ?? buildArtifactDir(fixture.id, false);
  await writeArtifacts(artifactDir, {
    "fixture.json": fixture,
    "assistant.raw.txt": rawResponse,
    "tool-requests.json": {
      extraction: evaluated.extraction,
      allowed: evaluated.modeFiltered.allowed,
      blocked: evaluated.modeFiltered.blocked
    },
    "tool-results.json": evaluated.toolResults,
    "patch.json": evaluated.patch ?? { patch: null },
    "preview.json": evaluated.preview ?? { patch: null },
    "validation.json": evaluated.validation ?? { patch: null },
    "summary.json": evaluated.summary
  });
  progress("artifacts", artifactDir);

  return { artifactDir, fixture, ...evaluated };
}

export async function loadEvaluatorModule() {
  evaluatorModulePromise ??= loadEvaluatorModuleWithVite();
  return evaluatorModulePromise;
}

async function loadEvaluatorModuleWithVite() {
  const server = await createServer({
    appType: "custom",
    logLevel: "error",
    root: webRoot,
    server: { middlewareMode: true }
  });
  try {
    return await server.ssrLoadModule("/src/notebook/notebookAssistantEval.ts");
  } finally {
    await server.close();
  }
}

async function loadNotebookDocument(fixture) {
  if (!fixture.notebookPath) {
    throw new Error(`Fixture ${fixture.id} must define notebookPath.`);
  }
  return readJson(resolveEvalPath(fixture.notebookPath));
}

async function writeArtifacts(artifactDir, artifacts) {
  await fs.mkdir(artifactDir, { recursive: true });
  for (const [name, value] of Object.entries(artifacts)) {
    const filePath = path.join(artifactDir, name);
    const content = typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`;
    await fs.writeFile(filePath, content, "utf8");
  }
}

function buildArtifactDir(fixtureId, live) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.resolve(DEFAULT_ARTIFACT_ROOT, `${stamp}-${live ? "live-" : ""}${fixtureId}`);
}

function resolveEvalPath(relativePath) {
  return path.resolve(evalRoot, relativePath);
}

async function readJson(filePath) {
  return JSON.parse(await readText(filePath));
}

async function readText(filePath) {
  return fs.readFile(filePath, "utf8");
}

function createProgressReporter(options) {
  if (typeof options.onProgress === "function") {
    return options.onProgress;
  }
  if (options.progress || process.env.EVAL_NOTEBOOK_ASSISTANT_PROGRESS === "1") {
    return (stage, message) => console.log(`[notebook-assistant-eval:${stage}] ${message}`);
  }
  return () => {};
}

function summarizeText(value, max = 120) {
  const singleLine = String(value).replace(/\s+/g, " ").trim();
  return singleLine.length <= max ? singleLine : `${singleLine.slice(0, max - 1)}...`;
}
