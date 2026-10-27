import { PRIORITY_DISPATCH, PRIORITY_TASK } from '../config.mts'
import { defineBackgroundDomain, defineBackgroundJob } from './define-job.mts'
import type { PostPublicationEffectsJobData } from '@voucha/types/post-publication'
import { POST_PUBLICATION_EFFECTS_ORDERING_KEY } from './ordering-caps.mts'

export type ReviewSuccessionHistoryAuditJobData = {
  cursor: string | null
  cutoffArchivedAt: string | null
}

export const POST_PUBLICATION_DOMAIN = defineBackgroundDomain({
  domain: 'post-publication',
  workerConcurrency: 5,
})

export const POST_PUBLICATION_EFFECTS_JOB = defineBackgroundJob<PostPublicationEffectsJobData>(
  POST_PUBLICATION_DOMAIN,
  {
    name: 'apply-effects',
    priority: PRIORITY_TASK,
    sensitive: true,
    // Keep immutable preimages available through a datastore outage without retaining terminal PII.
    attempts: 10,
    backoff: { type: 'exponential', delay: 5000, jitter: 0.5 },
    ordering: { key: POST_PUBLICATION_EFFECTS_ORDERING_KEY },
  },
)

export const POST_PUBLICATION_REVIEW_SUCCESSION_AUDIT_JOB =
  defineBackgroundJob<ReviewSuccessionHistoryAuditJobData>(POST_PUBLICATION_DOMAIN, {
    name: 'audit-review-succession-history',
    priority: PRIORITY_DISPATCH,
  })

export const POST_PUBLICATION_JOBS = [
  POST_PUBLICATION_EFFECTS_JOB,
  POST_PUBLICATION_REVIEW_SUCCESSION_AUDIT_JOB,
] as const
