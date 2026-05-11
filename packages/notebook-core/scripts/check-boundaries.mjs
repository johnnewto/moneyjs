import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const root = new URL("../src/", import.meta.url);
const forbiddenImports = [
  /^react(?:$|\/)/,
  /^react-dom(?:$|\/)/,
  /^@codemirror(?:$|\/)/,
  /^vite(?:$|\/)/,
  /^vitest(?:$|\/)/,
  /^\.\.\/\.\.\/web(?:$|\/)/,
  /(?:^|\/)components(?:$|\/)/,
  /(?:^|\/)hooks(?:$|\/)/,
  /(?:^|\/)styles(?:$|\/)/,
  /(?:^|\/)app(?:$|\/)/
];

const importPattern = /(?:import|export)\s+(?:type\s+)?(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g;
const violations = [];

for (const file of await listSourceFiles(root)) {
  const source = await readFile(file, "utf8");
  for (const match of source.matchAll(importPattern)) {
    const specifier = match[1];
    if (forbiddenImports.some((pattern) => pattern.test(specifier))) {
      violations.push(`${relative(new URL("..", root).pathname, file)} imports ${specifier}`);
    }
  }
}

if (violations.length > 0) {
  console.error("notebook-core boundary violations:");
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

async function listSourceFiles(directoryUrl) {
  const entries = await readdir(directoryUrl, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      files.push(...(await listSourceFiles(new URL(`${entry.name}/`, directoryUrl))));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(new URL(entry.name, directoryUrl).pathname);
    }
  }
  return files;
}
