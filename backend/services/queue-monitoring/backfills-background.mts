import { BACKGROUND_QUEUE_NAME } from '@queues/background/config'
import {
  OPENAI_MODERATION_BACKFILL_IMAGES_JOB,
  OPENAI_MODERATION_BACKFILL_POSTS_JOB,
} from '@queues/background/enqueues/openai-moderation-jobs'
import { SES_INBOUND_RECONCILE_JOB } from '@queues/background/enqueues/ses-inbound-jobs'
import {
  enqueueBackfillImageModeration,
  enqueueBackfillPostModeration,
} from '@queues/openai-moderation/enqueues'
import { enqueueSesInboundReconcile } from '@queues/ses-inbound/enqueues'
import type { BackfillEntry } from './backfills-types.mts'
import { createBackfillTrigger } from './backfills-trigger-helpers.mts'

/** Backfills whose dispatcher job runs in the shared background queue. */
export const BACKGROUND_BACKFILLS: BackfillEntry[] = [
  {
    id: 'ses-inbound-reconciliation',
    queue_name: BACKGROUND_QUEUE_NAME,
    job_name: SES_INBOUND_RECONCILE_JOB.name,
    description: 'Re-enqueue raw inbound copyright emails still present in S3',
    source_table: 'external:ses-inbound-s3',
    trigger: createBackfillTrigger(enqueueSesInboundReconcile),
  },
  {
    id: 'openai-moderation-posts',
    queue_name: BACKGROUND_QUEUE_NAME,
    job_name: OPENAI_MODERATION_BACKFILL_POSTS_JOB.name,
    description: 'Backfill OpenAI moderation for posts missing results',
    source_table: 'posts',
    trigger: createBackfillTrigger(enqueueBackfillPostModeration),
  },
  {
    id: 'openai-moderation-images',
    queue_name: BACKGROUND_QUEUE_NAME,
    job_name: OPENAI_MODERATION_BACKFILL_IMAGES_JOB.name,
    description: 'Backfill OpenAI moderation for images missing results',
    source_table: 'images',
    trigger: createBackfillTrigger(enqueueBackfillImageModeration),
  },
]
