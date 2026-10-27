import { pagedDispatchJobOptions } from '@data-stores/valkey-glide-mq/paged-dispatcher'
import { PRIORITY_DISPATCH, PRIORITY_TASK } from '../config.mts'

const BACKOFF = { type: 'exponential', delay: 1000, jitter: 0.5 } as const
export const RETRY = {
  attempts: 3,
  backoff: BACKOFF,
  removeOnComplete: 100,
  removeOnFail: 100,
} as const
export const TASK = { priority: PRIORITY_TASK } as const
export const DISPATCH = { priority: PRIORITY_DISPATCH } as const
export const BULK_ORDERING = { key: 'notifications:bulk' } as const
export const VISIBILITY = {
  ...DISPATCH,
  ordering: BULK_ORDERING,
  // A failed page must retry indefinitely: nothing re-enqueues the rest of its chain.
  ...pagedDispatchJobOptions('notifications'),
} as const
