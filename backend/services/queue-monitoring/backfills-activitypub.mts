import type { BackfillEntry } from './backfills-types.mts'
import { enqueueRearmFailedActivityPubInboxDeliveries } from '@queues/activitypub/enqueues/inbox'

export const ACTIVITYPUB_BACKFILLS: BackfillEntry[] = [
  {
    id: 'activitypub-inbox-failed-deliveries',
    queue_name: 'activitypub',
    job_name: 'rearmFailedDeliveries',
    description: 'Re-arm and enqueue exhausted durable ActivityPub inbox envelopes',
    source_table: 'activitypub_inbox_delivery_work_items',
    trigger: async () => enqueueRearmFailedActivityPubInboxDeliveries(),
  },
]
