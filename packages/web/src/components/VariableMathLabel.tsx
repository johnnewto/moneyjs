import type { ReactNode } from "react";

export function VariableMathLabel({ name }: { name: string }) {
  return <span className="variable-math-label">{renderVariableMathLabel(name)}</span>;
}

export function renderVariableMathLabel(name: string): ReactNode[] {
  return parseVariableMathParts(name).map((part, index) => {
    if (part.kind === "text") {
      return part.value;
    }

    const Tag = part.kind === "sup" ? "sup" : "sub";
    return <Tag key={`${part.kind}-${index}`}>{part.value}</Tag>;
  });
}

export function renderVariableMathSvgLabel(name: string): ReactNode[] {
  return parseVariableMathParts(name).map((part, index) => {
    if (part.kind === "text") {
      return part.value;
    }

    return (
      <tspan
        key={`${part.kind}-${index}`}
        baselineShift={part.kind === "sup" ? "super" : "sub"}
        fontSize="72%"
      >
        {part.value}
      </tspan>
    );
  });
}

function parseVariableMathParts(name: string): Array<{ kind: "text" | "sup" | "sub"; value: string }> {
  const parts: Array<{ kind: "text" | "sup" | "sub"; value: string }> = [];
  let index = 0;

  while (index < name.length) {
    const char = name[index];
    if ((char === "^" || char === "_") && index + 1 < name.length) {
      const parsed = readScript(name, index + 1);
      if (parsed.value) {
        parts.push({ kind: char === "^" ? "sup" : "sub", value: parsed.value });
        index = parsed.nextIndex;
        continue;
      }
    }

    parts.push({ kind: "text", value: char });
    index += 1;
  }

  return parts;
}

function readScript(source: string, startIndex: number): { value: string; nextIndex: number } {
  if (source[startIndex] === "{") {
    const endIndex = source.indexOf("}", startIndex + 1);
    if (endIndex > startIndex + 1) {
      return {
        value: source.slice(startIndex + 1, endIndex),
        nextIndex: endIndex + 1
      };
    }
  }

  const match = source.slice(startIndex).match(/^[A-Za-z0-9]+/);
  if (match?.[0]) {
    return {
      value: match[0],
      nextIndex: startIndex + match[0].length
    };
  }

  return { value: "", nextIndex: startIndex };
}