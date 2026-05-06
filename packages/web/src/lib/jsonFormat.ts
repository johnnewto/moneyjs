export function stringifyJsonWithCompactLeaves(value: unknown, level = 0): string {
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
        `${childIndentation}${JSON.stringify(key)}: ${stringifyJsonWithCompactLeaves(entryValue, level + 1)}`
    )
    .join(",\n")}\n${indentation}}`;
}

function stringifyInlineJsonValue(value: unknown): string {
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

function isInlineJsonValue(value: unknown): boolean {
  if (value == null || typeof value !== "object") {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every((entry) => entry == null || typeof entry !== "object");
  }

  return Object.values(value).every((entry) => isInlineJsonValue(entry));
}

function isPrimitiveJsonValue(value: unknown): boolean {
  return value == null || typeof value !== "object";
}
