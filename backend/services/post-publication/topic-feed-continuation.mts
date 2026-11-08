import { randomUUID } from 'node:crypto'
import { enqueuePostPublicationEffects } from '@queues/post-publication/enqueues'
import type { PostPublicationEffectsJobData } from '@voucha/types/post-publication'
import { hashCapturedPublicationKeys } from './captured-keys.mts'

function topicFeedJob(topicIds: readonly string[]): PostPublicationEffectsJobData {
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
    continuation: {
      kind: 'topic_feed_discoverability',
      subjectIds: [...topicIds],
      subjectIndex: 0,
      after: null,
    },
  }
}

export async function enqueueTopicFeedDiscoverability(topicIds: readonly string[]): Promise<void> {
  await enqueuePostPublicationEffects(topicFeedJob(topicIds))
}
