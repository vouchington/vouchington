import type { BackfillEntry } from './backfills-types.mts'
import { BACKGROUND_QUEUE_NAME } from '@queues/background/config'
import { ACTIVITYPUB_RECOVER_OUTBOUND_JOB } from '@queues/background/enqueues/activitypub-jobs'
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
]
