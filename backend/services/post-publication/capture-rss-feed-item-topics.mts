import { randomUUID } from 'node:crypto'
import { registerPostCommitAction, type TransactionQuery } from '@data-stores/psql'
import { enqueueBulkPostPublicationEffects } from '@queues/post-publication/enqueues'
import {
  impactPublicationKeys,
  hashCapturedPublicationKeys,
  splitCapturedPublicationKeys,
} from './captured-keys.mts'

/** One best-effort bulk admission couples bounded preimage chunks to one source continuation. */
export function recordRssFeedItemTopicPublicationChanges(
  query: TransactionQuery,
  changes: readonly { rssFeedItemId: string; impactedTopicIds: readonly string[] }[],
): void {
  for (const change of changes) {
    const topicIds = [...new Set(change.impactedTopicIds)].toSorted()
    const topicId = topicIds[0]
    if (!topicId) continue
    const pages = splitCapturedPublicationKeys(impactPublicationKeys({ topicIds }))
    const changeId = randomUUID()
    const payloads = pages.map((keys, chunkIndex) => ({
      changeId,
      postId: null,
      scope: { type: 'topic' as const, id: topicId },
      reason: 'post_topics_changed',
      keys,
      keyHash: hashCapturedPublicationKeys(keys),
      chunkIndex,
      scopeStart: false,
      scopeTopicKeysCaptured: true,
      keyOffset: 0,
      ...(chunkIndex === 0
        ? {
            includeDeletedSourceFeeds: true,
            continuation: {
              kind: 'topic_merge_item_sources' as const,
              subjectIds: [change.rssFeedItemId],
              subjectIndex: 0,
              after: null,
            },
          }
        : {}),
    }))
    registerPostCommitAction(query, async () => {
      await enqueueBulkPostPublicationEffects(payloads)
    })
  }
}
