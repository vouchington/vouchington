import { copyExistingTopicEmbeddings } from '@services/embeddings-batch/entities/topics'
import { copyExistingPostEmbeddings } from '@services/embeddings-batch/entities/posts'
import { copyExistingRssFeedItemEmbeddings } from '@services/embeddings-batch/entities/rss-feed-items'
import {
  enqueueCreateTopicEmbeddingsBatch,
  enqueueCreatePostEmbeddingsBatch,
  enqueueCreateRssFeedItemEmbeddingsBatch,
} from '@queues/gemini-embeddings-batch/enqueues'
import { getTopicByAny } from '@services/topics/get'
import { getRssFeedItemById } from '@services/rss-feed-items'
import { getPostByAny } from '@services/posts/get'
import type { Job } from 'glide-mq'
import { dispatchStoryClusteringForEmbeddedItems } from '@services/stories/clustering/dispatch'
import { enqueueBanEvasionDetectionForEmbeddedFirstCommunityPosts } from '@services/posts/ban-evasion-embedding-enqueues'

export async function processGeminiEmbedding2SingleJob(
  job: Job<{ id?: string; rss_feed_item_id?: string }>,
): Promise<unknown> {
  switch (job.name) {
    case 'gemini-embeddings.post': {
      if (!job.data.id) throw new Error('Post job requires id in job.data')
      const post = await getPostByAny(job.data.id)
      if (!post) return null
      await copyExistingPostEmbeddings({ ids: [post.id] })
      await enqueueCreatePostEmbeddingsBatch()
      await enqueueBanEvasionDetectionForEmbeddedFirstCommunityPosts([post.id])
      return { success: true }
    }
    case 'gemini-embeddings.topic': {
      if (!job.data.id) throw new Error('Topic job requires id in job.data')
      const topic = await getTopicByAny(job.data.id)
      if (!topic) return null
      await copyExistingTopicEmbeddings({ ids: [topic.id] })
      await enqueueCreateTopicEmbeddingsBatch()
      return { success: true }
    }
    case 'gemini-embeddings.rss_feed_item': {
      if (job.data.rss_feed_item_id == null) {
        throw new Error('rss_feed_item job requires rss_feed_item_id in job.data')
      }
      const rssFeedItem = await getRssFeedItemById(job.data.rss_feed_item_id)
      if (!rssFeedItem) return null
      await copyExistingRssFeedItemEmbeddings({ ids: [rssFeedItem.id] })
      await enqueueCreateRssFeedItemEmbeddingsBatch()
      await dispatchStoryClusteringForEmbeddedItems([job.data.rss_feed_item_id])
      return { success: true }
    }
    default:
      throw new Error(`Unknown job type: ${job.name}`)
  }
}
