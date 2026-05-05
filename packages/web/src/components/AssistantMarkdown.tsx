import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";

import type { VariableDescriptions } from "../lib/variableDescriptions";
import { VariableLabel } from "./VariableLabel";
import { VariableMathLabel, renderVariableMathPlainText } from "./VariableMathLabel";

interface AssistantMarkdownProps {
  text: string;
  variableDescriptions?: VariableDescriptions;
}

export function AssistantMarkdown({ text, variableDescriptions }: AssistantMarkdownProps) {
  const annotatedText = annotateAssistantVariableMentions(annotateAssistantLagMentions(text), variableDescriptions);

  return (
    <div className="assistant-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          a: ({ children, href }) => (
            <a href={href} rel="noreferrer" target="_blank">
              {children}
            </a>
          ),
          code: ({ children, className }) => {
            const rawText = String(children).replace(/\n$/, "");
            const variableName = rawText.trim();
            const laggedVariableName = readAssistantLagVariableCode(variableName);
            if (!className && laggedVariableName) {
              return (
                <code className="assistant-variable-code">
                  <VariableLabel name={laggedVariableName} variableDescriptions={variableDescriptions}>
                    {renderLaggedVariableMathLabel(laggedVariableName)}
                  </VariableLabel>
                </code>
              );
            }
            if (!className && shouldRenderAssistantVariableCode(variableName, variableDescriptions)) {
              return (
                <code className="assistant-variable-code">
                  <VariableLabel name={variableName} variableDescriptions={variableDescriptions} />
                </code>
              );
            }
            return <code className={className}>{children}</code>;
          }
        }}
      >
        {annotatedText}
      </ReactMarkdown>
    </div>
  );
}

const ASSISTANT_LAG_CODE_PREFIX = "__sfcr_lag:";
const ASSISTANT_LAG_CODE_SUFFIX = "__";
const SIMPLE_LAG_PATTERN = /lag\(\s*([A-Za-z][A-Za-z0-9_.^{}]*)\s*\)/g;

function annotateAssistantLagMentions(text: string): string {
  return text
    .split(/(```[\s\S]*?```|`[^`\n]+`)/g)
    .map((segment) => {
      if (!segment || segment.startsWith("`")) {
        return segment;
      }

      return segment.replace(SIMPLE_LAG_PATTERN, (_match, variableName: string) => {
        return `\`${ASSISTANT_LAG_CODE_PREFIX}${variableName}${ASSISTANT_LAG_CODE_SUFFIX}\``;
      });
    })
    .join("");
}

function readAssistantLagVariableCode(value: string): string | null {
  if (!value.startsWith(ASSISTANT_LAG_CODE_PREFIX) || !value.endsWith(ASSISTANT_LAG_CODE_SUFFIX)) {
    return null;
  }

  const variableName = value.slice(
    ASSISTANT_LAG_CODE_PREFIX.length,
    value.length - ASSISTANT_LAG_CODE_SUFFIX.length
  );
  return variableName || null;
}

function renderLaggedVariableMathLabel(name: string) {
  return (
    <>
      <VariableMathLabel name={name} />
      <sub className="lag-subscript">−1</sub>
    </>
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
