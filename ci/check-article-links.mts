import { fileURLToPath } from 'node:url'
import {
  checkMarkdownArticleLinks,
  discoverMarkdownArticles,
} from 'vouchington-tooling/markdown-article-links'
import { parseFrontmatter } from '../backend/services/articles/parse.mts'
import { rewriteRelativeArticleLinks } from '../backend/services/articles/relative-links.mts'
import { renderMarkdownToHtml } from '../backend/services/markdown/render.mts'

const inputs = await discoverMarkdownArticles(
  fileURLToPath(new URL('../articles/', import.meta.url)),
)
const offenders = await checkMarkdownArticleLinks({
  inputs,
  routePrefix: '/article/',
  parse(source) {
    const { frontmatter, body } = parseFrontmatter(source)
    return { slug: frontmatter.slug, body }
  },
  rewrite: rewriteRelativeArticleLinks,
  render: markdown => renderMarkdownToHtml(markdown, { allowHtml: true }),
})

for (const { name, href, reason } of offenders) {
  console.error(`articles/${name}: ${reason}: ${href}`)
}
if (offenders.length > 0) process.exitCode = 1
else console.log('Article links: ok')
