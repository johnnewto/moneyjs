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
  "src/notebook/templates/gl8-growth.notebook.json",
  "src/notebook/templates/opensimplest.notebook.json",
  "src/notebook/templates/simple-epidemic.notebook.json"
].map((relativePath) => path.resolve(webRoot, relativePath));

const requestedFiles = process.argv.slice(2);
const files = requestedFiles.length
  ? requestedFiles.map((inputPath) => path.resolve(process.cwd(), inputPath))
  : defaultFiles;

await Promise.all(
  files.map(async (filePath) => {
    const source = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(source);
    await fs.writeFile(filePath, `${stringifyJsonWithCompactLeaves(parsed)}\n`, "utf8");
  })
);

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
