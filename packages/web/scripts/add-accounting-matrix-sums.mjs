import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webRoot = path.resolve(__dirname, "..");

const defaultRoots = [
  path.resolve(webRoot, "src/notebook/templates"),
  path.resolve(webRoot, "public/notebook-examples")
];

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const checkOnly = args.includes("--check");
const kinds = parseKinds(args);
const requestedPaths = parseRequestedPaths(args);
const targetFiles = requestedPaths.length
  ? requestedPaths.map((inputPath) => path.resolve(process.cwd(), inputPath))
  : await collectNotebookFiles(defaultRoots);

const updates = [];

for (const filePath of targetFiles) {
  const source = await fs.readFile(filePath, "utf8");
  const document = JSON.parse(source);
  let updatedSource = source;
  let fileUpdateCount = 0;

  for (const cell of document.cells ?? []) {
    const matrixKind = inferAccountingMatrixKind(cell);
    if (!matrixKind || !kinds.has(matrixKind)) {
      continue;
    }

    const needsSumColumn = !hasSumColumn(cell);
    const needsSumRow = !hasSumRow(cell);
    if (!needsSumColumn && !needsSumRow) {
      continue;
    }

    const originalColumnCount = cell.columns.length;
    const finalColumnCount = originalColumnCount + (needsSumColumn ? 1 : 0);
    const operations = [];

    if (needsSumColumn) {
      updatedSource = appendSumColumn(updatedSource, cell.id, originalColumnCount);
      operations.push("Sum column");
    }

    if (needsSumRow) {
      updatedSource = insertMatrixRow(updatedSource, cell.id, createSumRow(finalColumnCount));
      operations.push("Sum row");
    }

    fileUpdateCount += 1;
    updates.push({
      cellTitle: cell.title ?? cell.id,
      filePath,
      kind: matrixKind,
      operations
    });
  }

  if (fileUpdateCount > 0 && !dryRun && !checkOnly) {
    await fs.writeFile(filePath, updatedSource, "utf8");
  }
}

if (updates.length === 0) {
  console.log("All selected accounting matrices already include required Sum rows and columns.");
} else {
  const mode = checkOnly ? "would need" : dryRun ? "would update" : "updated";
  for (const update of updates) {
    console.log(
      `${mode}: ${path.relative(process.cwd(), update.filePath)} :: ${update.cellTitle} (${update.kind}: ${update.operations.join(", ")})`
    );
  }
}

if (checkOnly && updates.length > 0) {
  process.exitCode = 1;
}

function parseKinds(inputArgs) {
  const selectedKinds = new Set();
  for (let index = 0; index < inputArgs.length; index += 1) {
    const arg = inputArgs[index];
    if (arg === "--kind") {
      const value = inputArgs[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("--kind requires one of: transaction-flow, balance-sheet");
      }
      selectedKinds.add(normalizeKind(value));
      index += 1;
      continue;
    }
    if (arg.startsWith("--kind=")) {
      selectedKinds.add(normalizeKind(arg.slice("--kind=".length)));
    }
  }

  return selectedKinds.size > 0
    ? selectedKinds
    : new Set(["transaction-flow", "balance-sheet"]);
}

function parseRequestedPaths(inputArgs) {
  const paths = [];
  for (let index = 0; index < inputArgs.length; index += 1) {
    const arg = inputArgs[index];
    if (arg === "--kind") {
      index += 1;
      continue;
    }
    if (arg.startsWith("--")) {
      continue;
    }
    paths.push(arg);
  }
  return paths;
}

function normalizeKind(value) {
  const normalizedValue = normalizeAccountingLabel(value);
  if (normalizedValue === "transaction flow" || normalizedValue === "transactions flow") {
    return "transaction-flow";
  }
  if (normalizedValue === "balance sheet") {
    return "balance-sheet";
  }
  throw new Error(`Unknown accounting matrix kind '${value}'. Use transaction-flow or balance-sheet.`);
}

async function collectNotebookFiles(roots) {
  const files = [];
  for (const root of roots) {
    await collectNotebookFilesFromDirectory(root, files);
  }
  return files.sort();
}

async function collectNotebookFilesFromDirectory(directoryPath, files) {
  let entries;
  try {
    entries = await fs.readdir(directoryPath, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") {
      return;
    }
    throw error;
  }

  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      await collectNotebookFilesFromDirectory(entryPath, files);
      continue;
    }
    if (entry.isFile() && (entry.name.endsWith(".notebook.json") || entry.name.endsWith(".example.notebook.json"))) {
      files.push(entryPath);
    }
  }
}

function inferAccountingMatrixKind(cell) {
  if (!cell || cell.type !== "matrix") {
    return null;
  }

  const searchableText = normalizeAccountingLabel(`${cell.id ?? ""} ${cell.title ?? ""}`);
  if (searchableText.includes("transaction")) {
    return "transaction-flow";
  }
  if (searchableText.includes("balance sheet")) {
    return "balance-sheet";
  }
  return null;
}

function hasSumColumn(cell) {
  return (cell.columns ?? []).some((column) => normalizeAccountingLabel(column) === "sum");
}

function hasSumRow(cell) {
  return (cell.rows ?? []).some((row) => normalizeAccountingLabel(row.label ?? "") === "sum");
}

function createSumRow(columnCount) {
  return {
    band: "Sum",
    label: "Sum",
    values: Array.from({ length: columnCount }, () => "0")
  };
}

function appendSumColumn(source, cellId, originalColumnCount) {
  const cellRange = findCellObjectRange(source, cellId);
  let cellSource = source.slice(cellRange.start, cellRange.end);
  cellSource = appendPrimitiveToPropertyArray(cellSource, "columns", "Sum");

  if (cellSource.includes('"sectors": [')) {
    cellSource = appendPrimitiveToPropertyArray(cellSource, "sectors", "");
  }

  cellSource = appendPrimitiveToNestedArrays(cellSource, "values", "0", originalColumnCount);
  return `${source.slice(0, cellRange.start)}${cellSource}${source.slice(cellRange.end)}`;
}

function insertMatrixRow(source, cellId, row) {
  const cellRange = findCellObjectRange(source, cellId);
  const cellSource = source.slice(cellRange.start, cellRange.end);
  const rowsPropertyIndex = cellSource.indexOf('"rows": [');
  if (rowsPropertyIndex === -1) {
    throw new Error(`Matrix cell '${cellId}' does not have a rows array.`);
  }

  const rowsStart = cellSource.indexOf("[", rowsPropertyIndex);
  const rowsEnd = findMatchingDelimiter(cellSource, rowsStart, "[", "]");
  const insertText = formatAppendedRow(cellSource, rowsStart, rowsEnd, row);
  const updatedCellSource = `${cellSource.slice(0, rowsEnd)}${insertText}${cellSource.slice(rowsEnd)}`;
  return `${source.slice(0, cellRange.start)}${updatedCellSource}${source.slice(cellRange.end)}`;
}

function appendPrimitiveToPropertyArray(source, propertyName, value) {
  const propertyIndex = source.indexOf(`"${propertyName}": [`);
  if (propertyIndex === -1) {
    return source;
  }
  const arrayStart = source.indexOf("[", propertyIndex);
  const arrayEnd = findMatchingDelimiter(source, arrayStart, "[", "]");
  return appendPrimitiveToArray(source, arrayStart, arrayEnd, value);
}

function appendPrimitiveToNestedArrays(source, propertyName, value, expectedLength) {
  const edits = [];
  let searchIndex = 0;
  while (true) {
    const propertyIndex = source.indexOf(`"${propertyName}": [`, searchIndex);
    if (propertyIndex === -1) {
      break;
    }
    const arrayStart = source.indexOf("[", propertyIndex);
    const arrayEnd = findMatchingDelimiter(source, arrayStart, "[", "]");
    const parsedArray = JSON.parse(source.slice(arrayStart, arrayEnd + 1));
    if (Array.isArray(parsedArray) && parsedArray.length === expectedLength) {
      edits.push({ arrayStart, arrayEnd });
    }
    searchIndex = arrayEnd + 1;
  }

  let updatedSource = source;
  for (const edit of edits.reverse()) {
    updatedSource = appendPrimitiveToArray(updatedSource, edit.arrayStart, edit.arrayEnd, value);
  }
  return updatedSource;
}

function appendPrimitiveToArray(source, arrayStart, arrayEnd, value) {
  const arrayContent = source.slice(arrayStart + 1, arrayEnd);
  const elementIndent = inferArrayElementIndent(source, arrayContent, arrayEnd);
  const closeIndent = getLineIndent(source, arrayEnd);
  const hasExistingValues = arrayContent.trim().length > 0;
  const lastNonWhitespace = findLastNonWhitespace(source, arrayStart + 1, arrayEnd);
  const needsComma = hasExistingValues && lastNonWhitespace !== -1 && source[lastNonWhitespace] !== ",";
  const prefix = hasExistingValues ? `${needsComma ? "," : ""}\n` : "\n";
  const suffix = arrayContent.includes("\n") || !hasExistingValues ? "" : `\n${closeIndent}`;

  return `${source.slice(0, arrayEnd)}${prefix}${elementIndent}${JSON.stringify(value)}${suffix}${source.slice(arrayEnd)}`;
}

function inferArrayElementIndent(source, arrayContent, arrayEnd) {
  const lineMatches = [...arrayContent.matchAll(/\n(\s*)[^\n\s][^\n]*/g)];
  return lineMatches.at(-1)?.[1] ?? `${getLineIndent(source, arrayEnd)}  `;
}

function findCellObjectRange(source, cellId) {
  const idNeedle = `"id": ${JSON.stringify(cellId)}`;
  const idIndex = source.indexOf(idNeedle);
  if (idIndex === -1) {
    throw new Error(`Could not find matrix cell '${cellId}'.`);
  }

  for (let openIndex = idIndex; openIndex >= 0; openIndex -= 1) {
    if (source[openIndex] !== "{") {
      continue;
    }
    const closeIndex = findMatchingDelimiter(source, openIndex, "{", "}");
    if (closeIndex > idIndex) {
      return { start: openIndex, end: closeIndex + 1 };
    }
  }

  throw new Error(`Could not find object range for matrix cell '${cellId}'.`);
}

function formatAppendedRow(source, rowsStart, rowsEnd, row) {
  const closingIndent = getLineIndent(source, rowsEnd);
  const rowIndent = `${closingIndent}  `;
  const propertyIndent = `${rowIndent}  `;
  const valueIndent = `${propertyIndent}  `;
  const hasExistingRows = source.slice(rowsStart + 1, rowsEnd).trim().length > 0;
  const prefix = hasExistingRows ? ",\n" : "\n";
  const values = row.values.map((value) => `${valueIndent}${JSON.stringify(value)}`).join(",\n");

  return `${prefix}${rowIndent}{\n${propertyIndent}"band": ${JSON.stringify(row.band)},\n${propertyIndent}"label": ${JSON.stringify(row.label)},\n${propertyIndent}"values": [\n${values}\n${propertyIndent}]\n${rowIndent}}\n${closingIndent}`;
}

function findMatchingDelimiter(source, startIndex, openDelimiter, closeDelimiter) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = startIndex; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === openDelimiter) {
      depth += 1;
    }
    if (char === closeDelimiter) {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  throw new Error(`Could not find matching '${closeDelimiter}'.`);
}

function findLastNonWhitespace(source, startIndex, endIndex) {
  for (let index = endIndex - 1; index >= startIndex; index -= 1) {
    if (!/\s/.test(source[index])) {
      return index;
    }
  }
  return -1;
}

function getLineIndent(source, index) {
  const lineStart = source.lastIndexOf("\n", index) + 1;
  return source.slice(lineStart, index).match(/^\s*/)?.[0] ?? "";
}

function normalizeAccountingLabel(value) {
  return String(value).trim().toLowerCase().replace(/[\s_-]+/g, " ");
}