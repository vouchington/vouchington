import { maskMarkdownCode } from '@services/posts/mask-markdown-code'

const ARTICLE_ROUTE = '/article'

/**
 * `./slug.md` or `slug.md` as an inline link destination or a link reference definition. Authored
 * articles keep this form so the links also work when the files are browsed on GitHub.
 */
const RELATIVE_ARTICLE_LINK =
  /(?<=\]\([ \t]*<?|^ {0,3}\[[^\]\n]+\]:[ \t]*<?)(?:\.\/)?([a-z0-9]+(?:-[a-z0-9]+)*)\.md(?=[#?)>\s]|$)/gm

/**
 * Rewrites authored `./slug.md` and `slug.md` article links to `/article/slug` so every consumer
 * of the stored Markdown (rendered HTML, API, MCP, RSS, and the `.md` alias) links to the article
 * page.
 *
 * Resolved against `/article/<slug>`, `./slug.md` becomes `/article/slug.md`, which the Cloudflare
 * Worker serves as the raw-Markdown alias instead of the article page. Links in code are left as
 * written, and a `#fragment` or `?query` after `.md` is kept.
 */
export function rewriteRelativeArticleLinks(markdown: string): string {
  const masked = maskMarkdownCode(markdown)
  let rewritten = ''
  let cursor = 0
  for (const match of markdown.matchAll(RELATIVE_ARTICLE_LINK)) {
    if (masked[match.index] !== markdown[match.index]) continue
    rewritten += `${markdown.slice(cursor, match.index)}${ARTICLE_ROUTE}/${match[1]}`
    cursor = match.index + match[0].length
  }
  return rewritten + markdown.slice(cursor)
}
