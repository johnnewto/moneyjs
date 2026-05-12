#!/usr/bin/env node
import { listFixtures, runChatBuilderEval } from "./lib.mjs";

const args = parseArgs(process.argv.slice(2));
const fixtureIds = args.all ? await listFixtures() : [args.fixture ?? "sim-basic"];
let failures = 0;

for (const fixtureId of fixtureIds) {
  try {
    const result = await runChatBuilderEval({
      fixtureId,
      live: args.live,
      model: args.model,
      endpoint: args.endpoint,
      discoveryUrl: args.discoveryUrl,
      origin: args.origin,
      artifactDir: args.artifactDir,
      progress: args.progress || args.live
    });
    const status = result.summary.ok ? "PASS" : "FAIL";
    console.log(`${status} ${fixtureId}`);
    printCompactSummary(result.summary);
    console.log(`Artifacts: ${result.artifactDir}`);
    if (!result.summary.ok) {
      failures += 1;
      for (const diagnostic of result.validation.diagnostics.slice(0, 10)) {
        console.log(`- [${diagnostic.phase}] ${diagnostic.message}`);
      }
    }
  } catch (error) {
    failures += 1;
    console.error(`ERROR ${fixtureId}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failures > 0) {
  process.exitCode = 1;
}

function parseArgs(argv) {
  const parsed = {
    all: false,
    live: false,
    progress: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") {
      continue;
    }
    switch (arg) {
      case "--all":
        parsed.all = true;
        break;
      case "--live":
        parsed.live = true;
        break;
      case "--fixture":
        parsed.fixture = argv[++index];
        break;
      case "--model":
        parsed.model = argv[++index];
        break;
      case "--endpoint":
        parsed.endpoint = argv[++index];
        break;
      case "--discovery-url":
        parsed.discoveryUrl = argv[++index];
        break;
      case "--origin":
        parsed.origin = argv[++index];
        break;
      case "--progress":
        parsed.progress = true;
        break;
      case "--artifact-dir":
        parsed.artifactDir = argv[++index];
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (parsed.live !== true && (parsed.model || parsed.endpoint || parsed.discoveryUrl || parsed.origin)) {
    throw new Error("--model, --endpoint, --discovery-url, and --origin are only valid with --live.");
  }
  return parsed;
}

function printCompactSummary(summary) {
  const request = summary.request ?? {};
  const response = summary.response ?? {};
  if (request.mode === "live") {
    console.log(`Request: live ${request.model} -> ${request.endpoint}`);
    console.log(`Origin: ${request.origin} Discovery: ${request.discoveryUrl}`);
  } else {
    console.log(`Request: offline saved response -> ${request.savedResponsePath}`);
  }
  console.log(`Prompt: ${request.promptChars ?? 0} chars "${request.promptPreview ?? ""}"`);
  console.log(`Retrieval: ${summary.selectedExamples.map((example) => `${example.id}:${example.score}`).join(", ")}`);
  console.log(
    response.parsed
      ? `Response: ${response.chars} chars parsed title="${response.title}" cells=${response.cellCount}`
      : `Response: ${response.chars} chars parse failed "${response.error}"`
  );
  console.log(`Validation: ok=${summary.ok} diagnostics=${summary.diagnosticsCount}`);
}
