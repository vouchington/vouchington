import { extractMarkdownUrls } from '@jongleberry/vurst-markdown'

type MarkdownExtraction = {
  link_urls: string[]
  image_urls: string[]
}

async function extract(markdownText: string | null | undefined): Promise<MarkdownExtraction> {
  const content = typeof markdownText === 'string' ? markdownText : ''
  if (!content) return { link_urls: [], image_urls: [] }
  const result = await extractMarkdownUrls(Buffer.from(content))
  return { link_urls: result.linkUrls, image_urls: result.imageUrls }
}

export default extract
