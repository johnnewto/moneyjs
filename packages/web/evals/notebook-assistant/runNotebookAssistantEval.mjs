#!/usr/bin/env node
import { listFixtures, runNotebookAssistantEval } from "./lib.mjs";

const args = parseArgs(process.argv.slice(2));
const fixtureIds = args.all ? await listFixtures() : [args.fixture ?? "ask-list-runs"];
let failures = 0;

for (const fixtureId of fixtureIds) {
  try {
    const result = await runNotebookAssistantEval({
      artifactDir: args.artifactDir,
      fixtureId,
      live: args.live,
      progress: args.progress || args.live
    });
    const status = result.summary.ok ? "PASS" : "FAIL";
    console.log(`${status} ${fixtureId}`);
    printCompactSummary(result.summary);
    console.log(`Artifacts: ${result.artifactDir}`);
    if (!result.summary.ok) {
      failures += 1;
      for (const diagnostic of result.summary.diagnostics.slice(0, 10)) {
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
  const parsed = { all: false, live: false, progress: false };
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
  return parsed;
}

function printCompactSummary(summary) {
  const request = summary.request ?? {};
  const response = summary.response ?? {};
  const tools = summary.tools ?? {};
  console.log(`Request: ${request.mode} ${request.assistantMode} saved response -> ${request.savedResponsePath}`);
  console.log(`Question: ${request.questionChars ?? 0} chars "${request.questionPreview ?? ""}"`);
  console.log(`Response: ${response.chars ?? 0} chars "${response.preview ?? ""}"`);
  console.log(`Tools: allowed=${(tools.allowed ?? []).map((tool) => tool.name).join(", ") || "none"} blocked=${(tools.blocked ?? []).length ?? 0}`);
  console.log(`Patch: ${summary.patchSummary ? JSON.stringify(summary.patchSummary) : "none"}`);
  console.log(`Validation: ok=${summary.ok} diagnostics=${summary.diagnosticsCount}`);
}
