import { BACKGROUND_QUEUE_NAME } from '@queues/background/config'
import { POST_PUBLICATION_REVIEW_SUCCESSION_AUDIT_JOB } from '@queues/background/enqueues/post-publication-jobs'
import { enqueueAuditReviewSuccessionHistory } from '@queues/post-publication/enqueues'
import type { BackfillEntry } from './backfills-types.mts'
import { createBackfillTrigger } from './backfills-trigger-helpers.mts'

export const POST_PUBLICATION_BACKFILLS: BackfillEntry[] = [
  {
    id: 'review-succession-history-dry-run',
    queue_name: BACKGROUND_QUEUE_NAME,
    job_name: POST_PUBLICATION_REVIEW_SUCCESSION_AUDIT_JOB.name,
    description: 'Run a read-only, bounded audit of historical review succession archive epochs',
    source_table: 'posts,post_review_topic_ratings,review_successions',
    trigger: createBackfillTrigger(enqueueAuditReviewSuccessionHistory),
  },
]
