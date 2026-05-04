import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";

import type { VariableDescriptions } from "../lib/variableDescriptions";
import { VariableLabel } from "./VariableLabel";

interface AssistantMarkdownProps {
  text: string;
  variableDescriptions?: VariableDescriptions;
}

export function AssistantMarkdown({ text, variableDescriptions }: AssistantMarkdownProps) {
  const annotatedText = annotateAssistantVariableMentions(text, variableDescriptions);

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
            if (!className && variableName && variableDescriptions?.has(variableName)) {
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
