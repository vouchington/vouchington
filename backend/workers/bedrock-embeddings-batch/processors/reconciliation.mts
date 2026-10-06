import { copyExistingTopicEmbeddings } from '@services/bedrock-embeddings-batch/entities/topics'
import { copyExistingPostEmbeddings } from '@services/bedrock-embeddings-batch/entities/posts'
import { copyExistingRssFeedItemEmbeddings } from '@services/bedrock-embeddings-batch/entities/rss-feed-items'
import { enqueueBanEvasionDetectionForCurrentEmbeddedFirstCommunityPosts } from '@services/communities/ban-evasion'
import {
  enqueuePostEmbeddingTriggerRecovery,
  enqueueReconcileExistingEmbeddings,
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
  ids?: readonly string[],
): Promise<ReconciliationPage> {
  const copy = {
    topics: copyExistingTopicEmbeddings,
    posts: copyExistingPostEmbeddings,
    rss_feed_items: copyExistingRssFeedItemEmbeddings,
  }[entityType]
  const enqueueContinuation = (cursor: string) =>
    enqueueReconcileExistingEmbeddings(entityType, cursor)
  return processReconciliationPage(
    after,
    cursor => copy({ ...(cursor === undefined ? {} : { after: cursor }), ids }),
    enqueueContinuation,
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
