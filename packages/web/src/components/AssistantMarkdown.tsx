import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";

import type { VariableDescriptions } from "../lib/variableDescriptions";
import type { VariableUnitMetadata } from "../lib/unitMeta";
import { documentHighlightClassName } from "../lib/variableHighlight";
import { VariableLabel } from "./VariableLabel";
import { renderVariableMathPlainText } from "./VariableMathLabel";

interface AssistantMarkdownProps {
  className?: string;
  currentValues?: Record<string, number | undefined>;
  highlightedVariable?: string | null;
  inline?: boolean;
  onSelectVariable?(variableName: string): void;
  text: string;
  variableDescriptions?: VariableDescriptions;
  variableUnitMetadata?: VariableUnitMetadata;
}

export function AssistantMarkdown({
  className,
  currentValues,
  highlightedVariable = null,
  inline = false,
  onSelectVariable,
  text,
  variableDescriptions,
  variableUnitMetadata
}: AssistantMarkdownProps) {
  const annotatedText = annotateAssistantVariableMentions(text, variableDescriptions);
  const Wrapper = inline ? "span" : "div";
  const inlineComponents = inline
    ? {
        h1: ({ children }: { children?: ReactNode }) => <>{children}</>,
        h2: ({ children }: { children?: ReactNode }) => <>{children}</>,
        h3: ({ children }: { children?: ReactNode }) => <>{children}</>,
        h4: ({ children }: { children?: ReactNode }) => <>{children}</>,
        h5: ({ children }: { children?: ReactNode }) => <>{children}</>,
        h6: ({ children }: { children?: ReactNode }) => <>{children}</>,
        p: ({ children }: { children?: ReactNode }) => <>{children}</>
      }
    : {};

  return (
    <Wrapper
      className={["assistant-markdown", inline ? "assistant-markdown-inline" : "", className]
        .filter(Boolean)
        .join(" ")}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          ...inlineComponents,
          a: ({ children, href }) => (
            <a href={href} rel="noreferrer" target="_blank">
              {children}
            </a>
          ),
          code: ({ children, className }) => {
            const rawText = String(children).replace(/\n$/, "");
            const variableName = rawText.trim();
            if (!className && shouldRenderAssistantEquationCode(rawText)) {
              return (
                <code className="assistant-equation-code">
                  {renderAssistantEquationTextWithOptions(
                    rawText,
                    onSelectVariable,
                    variableDescriptions,
                    variableUnitMetadata,
                    currentValues,
                    highlightedVariable
                  )}
                </code>
              );
            }

            if (!className && shouldRenderAssistantVariableCode(variableName, variableDescriptions)) {
              return renderAssistantVariableCode(
                variableName,
                onSelectVariable,
                variableDescriptions,
                variableUnitMetadata,
                currentValues,
                highlightedVariable
              );
            }
            return <code className={className}>{children}</code>;
          }
        }}
      >
        {annotatedText}
      </ReactMarkdown>
    </Wrapper>
  );
}

function shouldRenderAssistantEquationCode(value: string): boolean {
  const trimmed = value.trim();
  // Treat short, bare equation snippets as prose math instead of dark code blocks.
  return (
    trimmed.includes("=") &&
    trimmed.length <= 240 &&
    !trimmed.includes("\n\n") &&
    !/^\s*[{[]/.test(trimmed) &&
    !/[;{}]/.test(trimmed)
  );
}

function renderAssistantEquationText(value: string): ReactNode[] {
  return renderAssistantEquationTextWithOptions(value);
}

function renderAssistantEquationTextWithOptions(
  value: string,
  onSelectVariable?: (variableName: string) => void,
  variableDescriptions?: VariableDescriptions,
  variableUnitMetadata?: VariableUnitMetadata,
  currentValues?: Record<string, number | undefined>,
  highlightedVariable?: string | null
): ReactNode[] {
  return value.split(/(`[^`\n]+`)/g).map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      const variableName = part.slice(1, -1).trim();
      if (variableName) {
        return renderAssistantVariableInline(
          variableName,
          onSelectVariable,
          variableDescriptions,
          variableUnitMetadata,
          currentValues,
          `variable-${index}`,
          false,
          highlightedVariable
        );
      }
    }

    return part;
  });
}

function renderAssistantVariableCode(
  variableName: string,
  onSelectVariable?: (variableName: string) => void,
  variableDescriptions?: VariableDescriptions,
  variableUnitMetadata?: VariableUnitMetadata,
  currentValues?: Record<string, number | undefined>,
  highlightedVariable?: string | null
): ReactNode {
  return renderAssistantVariableInline(
    variableName,
    onSelectVariable,
    variableDescriptions,
    variableUnitMetadata,
    currentValues,
    `code-${variableName}`,
    true,
    highlightedVariable
  );
}

function renderAssistantVariableInline(
  variableName: string,
  onSelectVariable: ((variableName: string) => void) | undefined,
  variableDescriptions: VariableDescriptions | undefined,
  variableUnitMetadata: VariableUnitMetadata | undefined,
  currentValues: Record<string, number | undefined> | undefined,
  key: string,
  wrapInCode = false,
  highlightedVariable: string | null = null
): ReactNode {
  const label = (
    <VariableLabel
      currentValues={currentValues}
      name={variableName}
      variableDescriptions={variableDescriptions}
      variableUnitMetadata={variableUnitMetadata}
    />
  );

  if (!onSelectVariable) {
    const codeClassName = documentHighlightClassName(
      variableName,
      highlightedVariable,
      "assistant-variable-code"
    );
    return wrapInCode ? (
      <code key={key} className={codeClassName}>
        {label}
      </code>
    ) : (
      <VariableLabel
        key={key}
        currentValues={currentValues}
        name={variableName}
        variableDescriptions={variableDescriptions}
        variableUnitMetadata={variableUnitMetadata}
      />
    );
  }

  const content = wrapInCode ? <code className="assistant-variable-code">{label}</code> : label;

  return (
    <button
      key={key}
      type="button"
      className={documentHighlightClassName(variableName, highlightedVariable, "assistant-variable-button")}
      aria-label={`Inspect variable ${variableName}`}
      onClick={() => onSelectVariable(variableName)}
    >
      {content}
    </button>
  );
}

function shouldRenderAssistantVariableCode(
  variableName: string,
  variableDescriptions?: VariableDescriptions
): boolean {
  if (!variableName) {
    return false;
  }

  return (
    variableDescriptions?.has(variableName) === true ||
    renderVariableMathPlainText(variableName) !== variableName
  );
}

function annotateAssistantVariableMentions(
  text: string,
  variableDescriptions?: VariableDescriptions
): string {
  const variableNames = Array.from(variableDescriptions?.keys() ?? []).filter(Boolean);
  if (variableNames.length === 0) {
    return text;
  }

  const mentionPattern = new RegExp(
    `(^|[^A-Za-z0-9_.\\^{}])(${variableNames
      .sort((left, right) => right.length - left.length)
      .map(escapeRegExp)
      .join("|")})(?=$|[^A-Za-z0-9_.\\^{}])`,
    "g"
  );

  return text
    .split(/(```[\s\S]*?```|`[^`\n]+`)/g)
    .map((segment) => {
      if (!segment || segment.startsWith("`")) {
        return segment;
      }

      return segment.replace(mentionPattern, (_match, prefix: string, variableName: string) => {
        return `${prefix}\`${variableName}\``;
      });
    })
    .join("");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
