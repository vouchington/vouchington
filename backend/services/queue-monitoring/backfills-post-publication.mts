import { BACKGROUND_QUEUE_NAME } from '@queues/background/config'
import {
  POST_PUBLICATION_RECONCILE_JOB,
  POST_PUBLICATION_REVIEW_SUCCESSION_AUDIT_JOB,
  POST_PUBLICATION_SHADOW_AUDIT_JOB,
} from '@queues/background/enqueues/post-publication-jobs'
import {
  enqueueAuditReviewSuccessionHistory,
  enqueuePostPublicationShadowAudit,
  enqueueReconcilePostPublication,
} from '@queues/post-publication/enqueues'
import type { BackfillEntry } from './backfills-types.mts'
import {
  createBackfillDispatcherTrigger,
  createBackfillTrigger,
} from './backfills-trigger-helpers.mts'

export const POST_PUBLICATION_BACKFILLS: BackfillEntry[] = [
  {
    id: 'review-succession-history-dry-run',
    queue_name: BACKGROUND_QUEUE_NAME,
    job_name: POST_PUBLICATION_REVIEW_SUCCESSION_AUDIT_JOB.name,
    description: 'Run a read-only, bounded audit of historical review succession archive epochs',
    source_table: 'posts,post_review_topic_ratings,review_successions',
    trigger: createBackfillTrigger(enqueueAuditReviewSuccessionHistory),
  },
  {
    id: 'post-publication-reconciliation',
    queue_name: BACKGROUND_QUEUE_NAME,
    job_name: POST_PUBLICATION_RECONCILE_JOB.name,
    description: 'Drain coalesced durable post publication eligibility work',
    source_table: 'post_publication_dirty_work',
    trigger: createBackfillDispatcherTrigger(
      'post-publication-reconciliation',
      enqueueReconcilePostPublication,
    ),
  },
  {
    id: 'post-publication-shadow-repair',
    queue_name: BACKGROUND_QUEUE_NAME,
    job_name: POST_PUBLICATION_SHADOW_AUDIT_JOB.name,
    description: 'Run one checkpointed post-publication shadow repair page',
    source_table: 'posts,post_publication_reconciliation_audit_cursors',
    trigger: createBackfillTrigger(async () => {
      const job = await enqueuePostPublicationShadowAudit(false)
      return job
    }),
  },
  {
    id: 'post-publication-shadow-dry-run',
    queue_name: BACKGROUND_QUEUE_NAME,
    job_name: POST_PUBLICATION_SHADOW_AUDIT_JOB.name,
    description: 'Start a bounded post-publication shadow-audit dry run without repair writes',
    source_table: 'posts,post_publication_reconciliation_audit_cursors',
    trigger: createBackfillTrigger(async () => {
      const job = await enqueuePostPublicationShadowAudit(true)
      return job
    }),
  },
]
