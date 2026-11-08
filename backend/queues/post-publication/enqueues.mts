import { createBackgroundBulkEnqueue, createBackgroundEnqueue } from '@queues/background/enqueues'
import { createHash } from 'node:crypto'
import {
  PUBLISHER_TYPE_FEED_PUBLICATION_JOB,
  type PublisherTypeFeedJobData,
  POST_PUBLICATION_EFFECTS_JOB,
} from '@queues/background/enqueues/post-publication-jobs'
import type { EnqueueReturnType } from '@voucha/types'
import type { PostPublicationEffectsJobData } from '@voucha/types/post-publication'
import { POST_PUBLICATION_EFFECTS_JOB_ID_PREFIX } from './config.mts'

const enqueueEffectsJob = createBackgroundEnqueue(POST_PUBLICATION_EFFECTS_JOB)
export const enqueueBulkPostPublicationEffects = createBackgroundBulkEnqueue(
  POST_PUBLICATION_EFFECTS_JOB,
  (data: PostPublicationEffectsJobData) => ({
    data,
    opts: { jobId: postPublicationEffectJobId(data) },
  }),
)

/** Stable for a retried capture, distinct for two changes with identical old keys. */
export function enqueuePostPublicationEffects(
  data: PostPublicationEffectsJobData,
): EnqueueReturnType {
  return enqueueEffectsJob(data, {
    jobId: postPublicationEffectJobId(data),
  })
}

function postPublicationEffectJobId(data: PostPublicationEffectsJobData): string {
  const owner = data.postId ?? `${data.scope.type}__${data.scope.id}`
  const continuation = data.continuation
  const subjectId = continuation?.subjectIds[continuation.subjectIndex] ?? null
  if (continuation && !subjectId)
    throw new TypeError('Publication continuation requires a current subject')
  const descriptorHash = createHash('sha256')
    .update(
      JSON.stringify([
        data.keyHash,
        data.chunkIndex,
        data.scopeStart,
        data.scopeTopicKeysCaptured,
        data.keyOffset,
        continuation?.kind ?? null,
        subjectId,
        continuation?.subjectIds.slice(continuation.subjectIndex) ?? null,
        continuation?.subjectIndex ?? null,
        continuation?.after ?? null,
      ]),
    )
    .digest('hex')
  return `${POST_PUBLICATION_EFFECTS_JOB_ID_PREFIX}__${owner}__${data.changeId}__${descriptorHash}`
}

const enqueuePublisherFeeds = createBackgroundEnqueue(PUBLISHER_TYPE_FEED_PUBLICATION_JOB)

export function enqueuePublisherTypeFeedPublication(
  data: PublisherTypeFeedJobData,
  options: Parameters<typeof enqueuePublisherFeeds>[1] = {},
) {
  return enqueuePublisherFeeds(data, { jobId: publisherTypeFeedJobId(data), ...options })
}

function publisherTypeFeedJobId(data: PublisherTypeFeedJobData): string {
  return `${PUBLISHER_TYPE_FEED_PUBLICATION_JOB.name}__${data.changeId}__${data.afterTopicId ?? 'root'}`
}

export type { PublisherTypeFeedJobData } from '@queues/background/enqueues/post-publication-jobs'
