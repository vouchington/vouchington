import type { UserPurgeCursor } from './user-purge-types.mts'
import { cleanupOperationalTombstones } from './cleanup-operational-tombstones.mts'

export type CleanupOptions = {
  retentionDays?: number
  batchSize?: number
  maxBatches: number
  lowerBoundDate?: Date
  now?: Date
  userPurge?: UserPurgeCursor
}

export type CleanupResult = {
  deleted: number
  hasMore: boolean
}

export type ExpiryCleanupOptions = Pick<
  CleanupOptions,
  'batchSize' | 'maxBatches' | 'lowerBoundDate' | 'now'
>

export type OperationalCleanupOptions = Parameters<typeof cleanupOperationalTombstones>[1]
