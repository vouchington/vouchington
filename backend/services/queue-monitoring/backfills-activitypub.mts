import type { BackfillEntry } from './backfills-types.mts'
import { BACKGROUND_QUEUE_NAME } from '@queues/background/config'
import { ACTIVITYPUB_REARM_FAILED_DELIVERIES_JOB } from '@queues/background/enqueues/activitypub-jobs'
import { enqueueRearmFailedActivityPubInboxDeliveries } from '@queues/activitypub/enqueues/inbox'

export const ACTIVITYPUB_BACKFILLS: BackfillEntry[] = [
  {
    id: 'activitypub-inbox-failed-deliveries',
    queue_name: BACKGROUND_QUEUE_NAME,
    job_name: ACTIVITYPUB_REARM_FAILED_DELIVERIES_JOB.name,
    description: 'Re-arm and enqueue exhausted durable ActivityPub inbox envelopes',
    source_table: 'activitypub_inbox_delivery_work_items',
    trigger: async () => enqueueRearmFailedActivityPubInboxDeliveries(),
  },
]
