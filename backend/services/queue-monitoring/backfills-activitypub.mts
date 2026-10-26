import type { BackfillEntry } from './backfills-types.mts'
import { BACKGROUND_QUEUE_NAME } from '@queues/background/config'
import {
  ACTIVITYPUB_REARM_FAILED_DELIVERIES_JOB,
  ACTIVITYPUB_RECOVER_OUTBOUND_JOB,
} from '@queues/background/enqueues/activitypub-jobs'
import { enqueueRearmFailedActivityPubInboxDeliveries } from '@queues/activitypub/enqueues/inbox'
import { enqueueRecoverOutboundDistribution } from '@queues/activitypub/enqueues/outbound-recovery'

export const ACTIVITYPUB_BACKFILLS: BackfillEntry[] = [
  {
    id: 'activitypub-outbound-follows',
    queue_name: BACKGROUND_QUEUE_NAME,
    job_name: ACTIVITYPUB_RECOVER_OUTBOUND_JOB.name,
    description: 'Recover pending outbound Follow and UndoFollow distribution',
    source_table: 'relation__user__follow__user',
    trigger: async () => enqueueRecoverOutboundDistribution('follows'),
  },
  {
    id: 'activitypub-outbound-votes',
    queue_name: BACKGROUND_QUEUE_NAME,
    job_name: ACTIVITYPUB_RECOVER_OUTBOUND_JOB.name,
    description: 'Recover pending outbound Like and UndoLike distribution',
    source_table: 'post_votes',
    trigger: async () => enqueueRecoverOutboundDistribution('votes'),
  },
  {
    id: 'activitypub-inbox-failed-deliveries',
    queue_name: BACKGROUND_QUEUE_NAME,
    job_name: ACTIVITYPUB_REARM_FAILED_DELIVERIES_JOB.name,
    description: 'Re-arm and enqueue exhausted durable ActivityPub inbox envelopes',
    source_table: 'activitypub_inbox_delivery_work_items',
    trigger: async () => enqueueRearmFailedActivityPubInboxDeliveries(),
  },
]
