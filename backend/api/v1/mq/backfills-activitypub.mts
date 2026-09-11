import type { BackfillEntry } from './backfills-types.mts'
import { enqueueRearmFailedActivityPubInboxDeliveries } from '@queues/activitypub-inbox/enqueues'

export const ACTIVITYPUB_BACKFILLS: BackfillEntry[] = [
  {
    id: 'activitypub-inbox-failed-deliveries',
    queue_name: 'activitypub-inbox',
    job_name: 'rearmFailedDeliveries',
    description: 'Re-arm and enqueue exhausted durable ActivityPub inbox envelopes',
    source_table: 'ap_inbox_deliveries',
    trigger: async () => await enqueueRearmFailedActivityPubInboxDeliveries(),
  },
]
