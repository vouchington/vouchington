import { replaceEntityMentions } from '@services/entity-links'
import { renderMarkdownToHtml, type MarkdownRenderOptions } from './render.mts'

export { renderMarkdownToHtml, renderMarkdownToHtmlBatch } from './render.mts'

async function renderMarkdown(
  text: string | null | undefined,
  options: MarkdownRenderOptions = {},
): Promise<string> {
  const html = await renderMarkdownToHtml(text, options)
  if (!html) return ''
  return replaceEntityMentions(html)
}

export default renderMarkdown
