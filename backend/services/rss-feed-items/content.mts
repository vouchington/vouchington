import type { RssFeedItemToUpsert } from './types.mts'
import { visibleRssText } from '@modules/utils'
import { createEmbeddingDocumentHash } from '@voucha/types/embedding-content'

export const createRssFeedItemEmbeddingContent = (data: RssFeedItemToUpsert) => {
  const rawTitle = data.title || ''
  const contentFields = [
    data['content:encodedSnippet'],
    data['content:encoded'],
    data.contentSnippet,
    data.content,
    data.description,
    data.summary,
    data['media:description'],
  ]
  const rawCategories = data.categories?.join(', ') || ''
  const title = visibleRssText(rawTitle)
  const content = contentFields
    .flatMap(field => {
      const text = visibleRssText(field || '')
      return text ? [text] : []
    })
    .join('\n')
  const categories = visibleRssText(rawCategories)
  const body = [content, categories].filter(Boolean).join('\n')
  const fullContent = `${title}\n${content}\n${categories}`
  return {
    content: fullContent,
    title,
    body,
    content_sha256: createEmbeddingDocumentHash(body, title),
  }
}
