import type { RssFeedItemToUpsert } from './types.mts'
import { sha256, visibleRssText } from '@modules/utils'

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
  const fullContent = `${title}\n${content}\n${categories}`
  return {
    content: fullContent,
    content_sha256: sha256(fullContent),
  }
}
