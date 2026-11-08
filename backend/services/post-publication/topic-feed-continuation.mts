import { randomUUID } from 'node:crypto'
import { registerPostCommitAction, type TransactionQuery } from '@data-stores/psql'
import { enqueuePostPublicationEffects } from '@queues/post-publication/enqueues'
import type { PostPublicationEffectsJobData } from '@voucha/types/post-publication'
import { hashCapturedPublicationKeys } from './captured-keys.mts'

type Kind = 'topic_feed_publication' | 'topic_feed_discoverability'

function topicFeedJob(
  topicIds: readonly string[],
  after: string | null,
  kind: Kind,
): PostPublicationEffectsJobData {
  return {
    changeId: randomUUID(),
    postId: null,
    scope: { type: 'topic', id: topicIds[0]! },
    reason: 'rss_feed_discoverability_changed',
    keys: [],
    keyHash: hashCapturedPublicationKeys([]),
    chunkIndex: 0,
    scopeStart: false,
    scopeTopicKeysCaptured: false,
    keyOffset: 0,
    continuation: { kind, subjectIds: [...topicIds], subjectIndex: 0, after },
  }
}

export function enqueueTopicFeedPublicationAfterCommit(
  query: TransactionQuery,
  topicIds: readonly string[],
  after: string,
): void {
  const job = topicFeedJob(topicIds, after, 'topic_feed_publication')
  registerPostCommitAction(query, async () => {
    await enqueuePostPublicationEffects(job)
  })
}

export async function enqueueTopicFeedDiscoverability(topicIds: readonly string[]): Promise<void> {
  await enqueuePostPublicationEffects(topicFeedJob(topicIds, null, 'topic_feed_discoverability'))
}
