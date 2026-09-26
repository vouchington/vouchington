/* oxlint-disable no-restricted-imports -- docs-publish needs a GFM-aware Markdown-to-HTML renderer */
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import rehypeStringify from 'rehype-stringify'

const PAGE_STYLE = `
  body { font-family: ui-sans-serif, system-ui, sans-serif; max-width: 80rem; margin: 2rem auto; padding: 0 1.5rem; line-height: 1.5; color: #1a1a1a; }
  table { border-collapse: collapse; width: 100%; margin: 1rem 0; font-size: 0.875rem; }
  th, td { border: 1px solid #d0d0d0; padding: 0.35rem 0.6rem; text-align: left; vertical-align: top; }
  th { background: #f0f0f0; }
  code { font-family: ui-monospace, monospace; background: #f5f5f5; padding: 0.1rem 0.3rem; border-radius: 3px; }
  pre { background: #f5f5f5; padding: 0.75rem 1rem; border-radius: 4px; overflow-x: auto; }
  pre code { padding: 0; }
  h2 { border-top: 1px solid #d0d0d0; padding-top: 1.5rem; margin-top: 2rem; }
`

// Shared page shell for the static pages docs-publish renders onto the credentialed docs site.
export function htmlPage(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>${PAGE_STYLE}</style>
</head>
<body>
${body}
</body>
</html>
`
}

export async function renderMarkdownToHtml(markdown: string): Promise<string> {
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeStringify)
    .process(markdown)
  return String(file)
}
