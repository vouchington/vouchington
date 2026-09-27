import { copyExistingTopicEmbeddings } from '@services/bedrock-embeddings-batch/entities/topics'
import { copyExistingPostEmbeddings } from '@services/bedrock-embeddings-batch/entities/posts'
import { copyExistingRssFeedItemEmbeddings } from '@services/bedrock-embeddings-batch/entities/rss-feed-items'
import { enqueueBanEvasionDetectionForCurrentEmbeddedFirstCommunityPosts } from '@services/communities/ban-evasion'
import { reconcilePendingStoryClusteringEmbeddingTriggers } from '@services/stories/embedding-trigger'
import {
  enqueuePostEmbeddingTriggerRecovery,
  enqueueReconcileExistingEmbeddings,
  enqueueRssStoryTriggerRecovery,
} from '@queues/bedrock-embeddings-batch/enqueues'
import type { ReconciliationEntityType } from '@queues/bedrock-embeddings-batch/types'

type ReconciliationPage = { nextCursor: string | null }

export async function processReconciliationPage<TPage extends ReconciliationPage>(
  after: string | undefined,
  readPage: (after?: string) => Promise<TPage>,
  enqueueContinuation: (after: string) => unknown | Promise<unknown>,
): Promise<TPage> {
  const page = await readPage(after)
  if (page.nextCursor !== null) await enqueueContinuation(page.nextCursor)
  return page
}

export function processExistingEmbeddingReconciliation(
  entityType: ReconciliationEntityType,
  after?: string,
): Promise<ReconciliationPage> {
  const copy = {
    topics: copyExistingTopicEmbeddings,
    posts: copyExistingPostEmbeddings,
    rss_feed_items: copyExistingRssFeedItemEmbeddings,
  }[entityType]
  return processReconciliationPage(
    after,
    cursor => copy(cursor === undefined ? {} : { after: cursor }),
    async cursor => await enqueueReconcileExistingEmbeddings(entityType, cursor),
  )
}

export function processPostEmbeddingTriggerRecovery(after?: string): Promise<ReconciliationPage> {
  return processReconciliationPage(
    after,
    cursor =>
      enqueueBanEvasionDetectionForCurrentEmbeddedFirstCommunityPosts(
        cursor === undefined ? {} : { after: cursor },
      ),
    enqueuePostEmbeddingTriggerRecovery,
  )
}

export function processRssStoryTriggerRecovery(after?: string): Promise<ReconciliationPage> {
  return processReconciliationPage(
    after,
    cursor =>
      reconcilePendingStoryClusteringEmbeddingTriggers(
        cursor === undefined ? {} : { after: cursor },
      ),
    enqueueRssStoryTriggerRecovery,
  )
}
