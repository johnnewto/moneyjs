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

export function renderVariableMathPlainText(name: string): string {
  return parseVariableMathParts(name)
    .map((part) => part.value)
    .join("");
}

const GREEK_SYMBOLS = new Map([
  ["alpha", "α"],
  ["Alpha", "Α"],
  ["beta", "β"],
  ["Beta", "Β"],
  ["gamma", "γ"],
  ["Gamma", "Γ"],
  ["delta", "δ"],
  ["Delta", "Δ"],
  ["eps", "ε"],
  ["Eps", "Ε"],
  ["epsilon", "ε"],
  ["Epsilon", "Ε"],
  ["zeta", "ζ"],
  ["Zeta", "Ζ"],
  ["eta", "η"],
  ["Eta", "Η"],
  ["theta", "θ"],
  ["Theta", "Θ"],
  ["iota", "ι"],
  ["Iota", "Ι"],
  ["kappa", "κ"],
  ["Kappa", "Κ"],
  ["lambda", "λ"],
  ["Lambda", "Λ"],
  ["mu", "μ"],
  ["Mu", "Μ"],
  ["nu", "ν"],
  ["Nu", "Ν"],
  ["xi", "ξ"],
  ["Xi", "Ξ"],
  ["omicron", "ο"],
  ["Omicron", "Ο"],
  ["pi", "π"],
  ["Pi", "Π"],
  ["rho", "ρ"],
  ["Rho", "Ρ"],
  ["sigma", "σ"],
  ["Sigma", "Σ"],
  ["tau", "τ"],
  ["Tau", "Τ"],
  ["upsilon", "υ"],
  ["Upsilon", "Υ"],
  ["phi", "φ"],
  ["Phi", "Φ"],
  ["chi", "χ"],
  ["Chi", "Χ"],
  ["psi", "ψ"],
  ["Psi", "Ψ"],
  ["omega", "ω"],
  ["Omega", "Ω"]
]);
const GREEK_SYMBOL_ENTRIES = [...GREEK_SYMBOLS].sort((left, right) => right[0].length - left[0].length);
const GREEK_NAMES_WITH_LETTER_SUFFIXES = new Set([
  "alpha",
  "beta",
  "gamma",
  "delta",
  "eps",
  "epsilon",
  "theta",
  "lambda",
  "rho",
  "sigma",
  "tau",
  "phi",
  "omega"
]);

function parseVariableMathParts(name: string): Array<{ kind: "text" | "sup" | "sub"; value: string }> {
  const parts: Array<{ kind: "text" | "sup" | "sub"; value: string }> = [];
  let index = 0;

  while (index < name.length) {
    const char = name[index];
    if ((char === "^" || char === "_") && index + 1 < name.length) {
      const parsed = readScript(name, index + 1);
      if (parsed.value) {
        parts.push({ kind: char === "^" ? "sup" : "sub", value: renderGreekWord(parsed.value) });
        index = parsed.nextIndex;
        continue;
      }
    }

    const greek = readGreekPrefix(name, index);
    if (greek) {
      parts.push({ kind: "text", value: greek.symbol });
      if (greek.suffix) {
        parts.push({ kind: "sub", value: greek.suffix });
      }
      index = greek.nextIndex;
      continue;
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

function readGreekPrefix(
  source: string,
  startIndex: number
): { symbol: string; suffix: string; nextIndex: number } | null {
  const remainder = source.slice(startIndex);
  const wordMatch = remainder.match(/^[A-Za-z][A-Za-z0-9]*/);
  const word = wordMatch?.[0];
  if (!word) {
    return null;
  }

  for (const [name, symbol] of GREEK_SYMBOL_ENTRIES) {
    if (word === name) {
      return {
        symbol,
        suffix: "",
        nextIndex: startIndex + name.length
      };
    }

    const suffix = word.slice(name.length);
    if (
      word.startsWith(name) &&
      (/^[0-9]+$/.test(suffix) ||
        (GREEK_NAMES_WITH_LETTER_SUFFIXES.has(name) && /^[a-z][a-z0-9]*$/.test(suffix)))
    ) {
      return {
        symbol,
        suffix,
        nextIndex: startIndex + word.length
      };
    }
  }

  return null;
}

function renderGreekWord(value: string): string {
  return GREEK_SYMBOLS.get(value) ?? value;
}
