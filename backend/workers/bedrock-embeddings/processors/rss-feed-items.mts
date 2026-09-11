import { createRssFeedItemEmbeddingContent } from '@services/rss-feed-items/content'
import { createSingleEmbedding, hasCurrentRssFeedItemEmbedding } from '@services/bedrock-embeddings'
import type { ViewRssFeedItem } from '@services/rss-feed-items/types'

export const upsertRssFeedItemEmbedding = async (rssFeedItem: ViewRssFeedItem) => {
  const { content, content_sha256 } = await createRssFeedItemEmbeddingContent(rssFeedItem.data)

  if (await hasCurrentRssFeedItemEmbedding(rssFeedItem.id, content_sha256)) {
    return {
      content_sha256,
    }
  }

  await createSingleEmbedding({
    type: 'rss_feed_item',
    id: rssFeedItem.id,
    content,
  })

  return {
    content_sha256,
  }
}
