import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";

const inlineComponents = {
  h1: ({ children }: { children?: ReactNode }) => <>{children}</>,
  h2: ({ children }: { children?: ReactNode }) => <>{children}</>,
  h3: ({ children }: { children?: ReactNode }) => <>{children}</>,
  h4: ({ children }: { children?: ReactNode }) => <>{children}</>,
  h5: ({ children }: { children?: ReactNode }) => <>{children}</>,
  h6: ({ children }: { children?: ReactNode }) => <>{children}</>,
  p: ({ children }: { children?: ReactNode }) => <>{children}</>,
  ul: ({ children }: { children?: ReactNode }) => <>{children}</>,
  ol: ({ children }: { children?: ReactNode }) => <>{children}</>,
  li: ({ children }: { children?: ReactNode }) => <>{children}</>,
  blockquote: ({ children }: { children?: ReactNode }) => <>{children}</>,
  a: ({ children }: { children?: ReactNode }) => <>{children}</>,
  code: ({ children, className }: { children?: ReactNode; className?: string }) => (
    <code className={className ?? "row-comment-code"}>{children}</code>
  )
};

export function RowCommentMarkdown({ text }: { text: string }) {
  const source = text.trim();
  if (!source) {
    return null;
  }

  return (
    <div className="row-comment-markdown">
      <ReactMarkdown rehypePlugins={[rehypeSanitize]} components={inlineComponents}>
        {source}
      </ReactMarkdown>
    </div>
  );
}
