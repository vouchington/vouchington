import { upsertTopicEmbedding } from '@services/bedrock-embeddings'
import { upsertPostEmbedding } from './posts.mts'
import { upsertRssFeedItemEmbedding } from './rss-feed-items.mts'
import { getTopicByAny } from '@services/topics/get'
import { getRssFeedItemById } from '@services/rss-feed-items'
import { getPostByAny } from '@services/posts/get'
import type { Job } from 'glide-mq'
import { dispatchStoryClusteringForEmbeddedItems } from '@services/stories/clustering/dispatch'
import { enqueueBanEvasionDetectionForEmbeddedFirstCommunityPosts } from '@services/communities/ban-evasion'

export async function processBedrockNovaMultimodalV1SingleJob(
  job: Job<{ id?: string; rss_feed_item_id?: string }>,
): Promise<unknown> {
  switch (job.name) {
    case 'bedrock-embeddings.post': {
      if (!job.data.id) throw new Error('Post job requires id in job.data')
      const post = await getPostByAny(job.data.id)
      if (!post) return null
      await upsertPostEmbedding(post)
      await enqueueBanEvasionDetectionForEmbeddedFirstCommunityPosts([post.id])
      return { success: true }
    }
    case 'bedrock-embeddings.topic': {
      if (!job.data.id) throw new Error('Topic job requires id in job.data')
      const topic = await getTopicByAny(job.data.id)
      if (!topic) return null
      await upsertTopicEmbedding(topic)
      return { success: true }
    }
    case 'bedrock-embeddings.rss_feed_item': {
      if (job.data.rss_feed_item_id == null) {
        throw new Error('rss_feed_item job requires rss_feed_item_id in job.data')
      }
      const rssFeedItem = await getRssFeedItemById(job.data.rss_feed_item_id)
      if (!rssFeedItem) return null
      await upsertRssFeedItemEmbedding(rssFeedItem)
      await dispatchStoryClusteringForEmbeddedItems([job.data.rss_feed_item_id])
      return { success: true }
    }
    default:
      throw new Error(`Unknown job type: ${job.name}`)
  }
}
