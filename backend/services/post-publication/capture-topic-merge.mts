import type { TransactionQuery } from '@data-stores/psql'
import { impactPublicationKeys } from './captured-keys.mts'
import { enqueueCapturedPublicationChangeAfterCommit } from './direct-capture.mts'

/**
 * Registers the committed topic-merge change. Every moved reference survives on the destination,
 * so one immutable destination-scoped change starts indexed page discovery after commit instead of
 * retaining one action per moved row.
 */
export function recordTopicMergePublicationChange(
  query: TransactionQuery,
  sourceTopicId: string,
  destinationTopicId: string,
): void {
  enqueueCapturedPublicationChangeAfterCommit(query, {
    scope: { type: 'topic', topicId: destinationTopicId },
    reason: 'post_topics_changed',
    keys: impactPublicationKeys({ topicIds: [sourceTopicId, destinationTopicId] }),
  })
}
