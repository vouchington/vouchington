import { createBackgroundBulkEnqueue, createBackgroundEnqueue } from '@queues/background/enqueues'
import { createHash } from 'node:crypto'
import {
  POST_PUBLICATION_EFFECTS_JOB,
  POST_PUBLICATION_REVIEW_SUCCESSION_AUDIT_JOB,
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

export function postPublicationEffectJobId(data: PostPublicationEffectsJobData): string {
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
        continuation?.kind ?? null,
        subjectId,
        continuation?.subjectIndex ?? null,
        continuation?.after ?? null,
      ]),
    )
    .digest('hex')
  return `${POST_PUBLICATION_EFFECTS_JOB_ID_PREFIX}__${owner}__${data.changeId}__${descriptorHash}`
}

const enqueueReviewSuccessionHistoryAuditJob = createBackgroundEnqueue(
  POST_PUBLICATION_REVIEW_SUCCESSION_AUDIT_JOB,
)

/** Starts a read-only, UUID-paged audit of pre-cutover review succession history. */
export function enqueueAuditReviewSuccessionHistory(): EnqueueReturnType {
  return enqueueReviewSuccessionHistoryAuditJob({ cursor: null, cutoffArchivedAt: null })
}

/** Continues the same frozen historical scope after a full audit page. */
export function enqueueContinueAuditReviewSuccessionHistory(
  cursor: string,
  cutoffArchivedAt: string,
): EnqueueReturnType {
  return enqueueReviewSuccessionHistoryAuditJob({ cursor, cutoffArchivedAt })
}
