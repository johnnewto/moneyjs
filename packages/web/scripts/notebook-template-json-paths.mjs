import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const webRoot = path.resolve(__dirname, "..");
export const generatedNotebookJsonDir = path.resolve(
  webRoot,
  "src/notebook/templates/generated"
);

export async function listGeneratedNotebookJsonFiles() {
  const entries = await fs.readdir(generatedNotebookJsonDir);
  return entries
    .filter((name) => name.endsWith(".notebook.json"))
    .sort()
    .map((name) => path.resolve(generatedNotebookJsonDir, name));
}

export function isGeneratedNotebookJsonPath(filePath) {
  const resolved = path.resolve(filePath);
  const relative = path.relative(generatedNotebookJsonDir, resolved);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}
