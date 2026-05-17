import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createServer } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webRoot = path.resolve(__dirname, "..");
const workspaceRoot = path.resolve(webRoot, "../..");
const templatesRoot = path.resolve(webRoot, "src/notebook/templates");
const generatedRoot = path.resolve(templatesRoot, "generated");
const publicExamplesRoot = path.resolve(webRoot, "public/notebook-examples");
const notebookCoreEntry = path.resolve(workspaceRoot, "packages/notebook-core/src/index.ts");

const args = process.argv.slice(2);
const write = args.includes("--write");
const writePublicExamples = args.includes("--write-public-examples");
const preserveIds = args.includes("--preserve-ids");
const requestedTemplateIds = args.filter((arg) => !arg.startsWith("--"));
const defaultTemplateIds = ["bmw", "sim"];
const templateIds = requestedTemplateIds.length ? requestedTemplateIds : defaultTemplateIds;

if (args.includes("--compact-init") || args.includes("--convert-only")) {
  throw new Error(
    "compile-notebook-yaml no longer rewrites templates from legacy JSON. Edit the YAML templates directly or export compact YAML from the app."
  );
}

const viteServer = await createServer({
  configFile: false,
  root: webRoot,
  logLevel: "silent",
  server: { middlewareMode: true },
  optimizeDeps: { disabled: true }
});

try {
  const { notebookFromYaml, notebookToCompactYaml, stringifyJsonWithCompactLeaves, validateNotebookDocument } =
    await viteServer.ssrLoadModule(pathToFileURL(notebookCoreEntry).href);

  await fs.mkdir(generatedRoot, { recursive: true });

  for (const templateId of templateIds) {
    const yamlPath = path.resolve(templatesRoot, `${templateId}.notebook.yaml`);
    const generatedJsonPath = path.resolve(generatedRoot, `${templateId}.notebook.json`);
    const yamlSource = await fs.readFile(yamlPath, "utf8");
    const document = notebookFromYaml(yamlSource);
    validateNotebookJson(document, yamlPath, validateNotebookDocument);

    const compiledJson = `${stringifyJsonWithCompactLeaves(document)}\n`;
    if (write) {
      await fs.writeFile(generatedJsonPath, compiledJson, "utf8");
    } else {
      await assertFileMatches(generatedJsonPath, compiledJson);
    }

    if (writePublicExamples) {
      await fs.writeFile(
        path.resolve(publicExamplesRoot, `${templateId}.example.notebook.yaml`),
        `${notebookToCompactYaml(document, { preserveIds }).trimEnd()}\n`,
        "utf8"
      );
      await fs.writeFile(path.resolve(publicExamplesRoot, `${templateId}.example.notebook.json`), compiledJson, "utf8");
    }

    console.log(`${templateId}: ${path.relative(webRoot, yamlPath)} -> ${path.relative(webRoot, generatedJsonPath)}`);
  }
} finally {
  await viteServer.close();
}

async function assertFileMatches(filePath, expected) {
  const actual = await fs.readFile(filePath, "utf8");
  if (actual !== expected) {
    throw new Error(
      `${path.relative(webRoot, filePath)} is stale. Run pnpm --filter @sfcr/web compile:notebook-yaml -- --write.`
    );
  }
}

function validateNotebookJson(document, sourcePath, validateNotebookDocument) {
  const issues = validateNotebookDocument(document);
  if (issues.length === 0) {
    return;
  }
  const messages = issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("\n");
  throw new Error(`${path.relative(webRoot, sourcePath)}: compiled JSON failed schema validation\n${messages}`);
}
