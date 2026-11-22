/* oxlint-disable no-await-in-loop -- each bounded keyset page commits before the next position. */
import { getMinUuidv7ForDate } from '@modules/utils'
import { DEFAULT_BATCH_SIZE } from './cleanup-batches.mts'
import { DATA_RETENTION_MAX_VALUES } from './config.mts'
import { getRetentionCutoffDate } from './cleanup-options.mts'
import { assertPositiveInteger, normalizePositiveInteger } from './normalize-positive-integer.mts'

import {
  cleanupAgentModerationPage,
  type AgentModerationCleanupContinuation,
  type AgentModerationCleanupResult,
} from './cleanup-agent-moderation-page.mts'

export type { AgentModerationCleanupContinuation, AgentModerationCleanupResult }

const ZERO_UUID = '00000000-0000-0000-0000-000000000000'
const AGENT_MODERATION_RETENTION_DAYS = 90

export type AgentModerationRetentionOptions = {
  postIds?: readonly string[]
  batchSize?: number
  maxBatches?: number
  now?: Date
}

type CleanupOptions = AgentModerationRetentionOptions & {
  maxBatches: number
  lowerBoundDate?: Date
  upperBoundDate?: Date
  continuation?: AgentModerationCleanupContinuation
  persistentRepairCursorForTest?: boolean
}

export async function cleanupObsoleteAgentModerations(
  options: CleanupOptions,
): Promise<AgentModerationCleanupResult> {
  const batchSize = Math.min(
    normalizePositiveInteger(options.batchSize, DEFAULT_BATCH_SIZE, 'batchSize'),
    DATA_RETENTION_MAX_VALUES.batch_size,
  )
  const maxBatches = Math.min(
    assertPositiveInteger(options.maxBatches, 'maxBatches'),
    DATA_RETENTION_MAX_VALUES.max_batches_per_run,
  )
  const now = options.now ?? new Date()
  const cutoffId = getMinUuidv7ForDate(getRetentionCutoffDate(AGENT_MODERATION_RETENTION_DAYS, now))
  const lowerBoundId = options.lowerBoundDate
    ? getMinUuidv7ForDate(options.lowerBoundDate)
    : ZERO_UUID
  const lowerBoundDueAt = options.lowerBoundDate
    ? new Date(options.lowerBoundDate.getTime() + AGENT_MODERATION_RETENTION_DAYS * 86_400_000)
    : new Date(0)
  const upperBoundId = options.upperBoundDate
    ? getMinUuidv7ForDate(options.upperBoundDate)
    : cutoffId
  const requestedUpperBoundId = upperBoundId < cutoffId ? upperBoundId : cutoffId
  const sweepUpperBoundId = options.continuation?.upperBoundId ?? requestedUpperBoundId
  const requestedUpperBoundDueAt = options.upperBoundDate
    ? new Date(
        Math.min(
          now.getTime(),
          options.upperBoundDate.getTime() + AGENT_MODERATION_RETENTION_DAYS * 86_400_000,
        ),
      ).toISOString()
    : now.toISOString()
  const sweepUpperBoundDueAt = options.continuation?.upperBoundDueAt ?? requestedUpperBoundDueAt
  let afterDueAt = options.continuation?.afterDueAt ?? lowerBoundDueAt.toISOString()
  let afterId = options.continuation?.afterId ?? ZERO_UUID
  let afterPostId = options.continuation?.afterPostId ?? ZERO_UUID
  const persistRepair =
    options.persistentRepairCursorForTest === true ||
    (!options.postIds && !options.lowerBoundDate && !options.upperBoundDate)
  let repair = options.continuation ? null : { id: ZERO_UUID, post_id: ZERO_UUID }
  let scanned = 0
  let deleted = 0
  let hasMore = false
  for (let batch = 0; batch < maxBatches; batch += 1) {
    const reserveRepairSlot = persistRepair && repair !== null && batch === maxBatches - 1
    // no-mistakes-disable-next-line query-reached-per-item: each bounded page depends on the previous committed due-keyset position; maxBatches and batchSize cap all reads and writes
    const page = await cleanupAgentModerationPage(
      batchSize,
      lowerBoundId,
      lowerBoundDueAt,
      sweepUpperBoundId,
      sweepUpperBoundDueAt,
      afterDueAt,
      afterId,
      afterPostId,
      repair,
      persistRepair,
      reserveRepairSlot,
      options.postIds,
    )
    scanned += page.scanned
    deleted += page.deleted
    hasMore = page.hasMore
    repair = page.repair
    if (page.continuation) {
      afterDueAt = page.continuation.afterDueAt
      afterId = page.continuation.afterId
      afterPostId = page.continuation.afterPostId
    } else if (!repair) break
  }
  return {
    scanned,
    deleted,
    hasMore,
    continuation: hasMore
      ? {
          afterDueAt,
          afterId,
          afterPostId,
          upperBoundDueAt: sweepUpperBoundDueAt,
          upperBoundId: sweepUpperBoundId,
        }
      : null,
  }
}
