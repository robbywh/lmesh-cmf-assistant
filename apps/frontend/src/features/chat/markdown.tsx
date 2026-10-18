import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const components: Components = {
  // Remote images would leak the reader's IP to arbitrary hosts; render none.
  img: () => null,
  a: ({ node: _node, ...props }) => (
    <a {...props} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2" />
  ),
  p: ({ node: _node, ...props }) => <p {...props} className="my-2 first:mt-0 last:mb-0" />,
  ul: ({ node: _node, ...props }) => <ul {...props} className="my-2 list-disc pl-5" />,
  ol: ({ node: _node, ...props }) => <ol {...props} className="my-2 list-decimal pl-5" />,
  h1: ({ node: _node, ...props }) => <h3 {...props} className="mt-3 mb-1 text-base font-semibold" />,
  h2: ({ node: _node, ...props }) => <h3 {...props} className="mt-3 mb-1 text-base font-semibold" />,
  h3: ({ node: _node, ...props }) => <h4 {...props} className="mt-3 mb-1 text-sm font-semibold" />,
  code: ({ node: _node, ...props }) => (
    <code {...props} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]" />
  ),
  pre: ({ node: _node, ...props }) => (
    <pre {...props} className="my-2 overflow-x-auto rounded-md bg-muted p-3 text-sm" />
  ),
  table: ({ node: _node, ...props }) => (
    <div className="my-2 overflow-x-auto">
      <table {...props} className="w-full border-collapse text-sm" />
    </div>
  ),
  th: ({ node: _node, ...props }) => (
    <th {...props} className="border px-2 py-1 text-left font-medium" />
  ),
  td: ({ node: _node, ...props }) => <td {...props} className="border px-2 py-1" />,
};

/**
 * Renders assistant Markdown (GFM). Raw HTML is never rendered as elements:
 * there is no rehype-raw, so tags are dropped by `skipHtml`.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={components}>
      {children}
    </ReactMarkdown>
  );
}
