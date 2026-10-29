import { cleanupPostModerationLedgerPage } from './cleanup-post-moderation-ledger-page.mts'
import { getMinUUIDv7ForDate } from '@modules/utils'
import { assertPositiveInteger } from './normalize-positive-integer.mts'
import {
  POST_MODERATION_RETENTION_KINDS,
  type PostModerationRetentionKind,
} from '@voucha/types/entities/moderation-retention'

export type { PostModerationRetentionKind }

export type PostModerationLedgerCleanupOptions = {
  batchSize: number
  maxBatches: number
  /** Required because both streams use the same policy age. */
  retentionDays: number
  now?: Date
  lowerBoundDate?: Date
  kinds?: readonly PostModerationRetentionKind[]
}

export type PostModerationLedgerCleanupResult = {
  deletedVersions: number
  clearedPassEvidence: number
  hasMore: boolean
  remainingKinds: PostModerationRetentionKind[]
}

/** A page and its durable UUIDv7 checkpoint commit together. */
export async function cleanupPostModerationLedger(
  options: PostModerationLedgerCleanupOptions,
): Promise<PostModerationLedgerCleanupResult> {
  const batchSize = assertPositiveInteger(options.batchSize, 'batchSize')
  const maxBatches = assertPositiveInteger(options.maxBatches, 'maxBatches')
  if (options.retentionDays < 90 || !Number.isInteger(options.retentionDays)) {
    throw new Error('Post moderation ledger retentionDays must be at least 90')
  }
  const cutoff = new Date(
    (options.now ?? new Date()).getTime() - options.retentionDays * 86_400_000,
  )
  // The upper bound is exclusive; include the entire millisecond exactly 90 days old.
  const cutoffId = getMinUUIDv7ForDate(new Date(cutoff.getTime() + 1))
  const lowerId = options.lowerBoundDate
    ? getMinUUIDv7ForDate(options.lowerBoundDate)
    : '00000000-0000-0000-0000-000000000000'
  let deletedVersions = 0
  let clearedPassEvidence = 0
  const remainingKinds: PostModerationRetentionKind[] = []
  for (const kind of POST_MODERATION_RETENTION_KINDS) {
    if (options.kinds && !options.kinds.includes(kind)) continue
    let hasMore = false
    for (let batch = 0; batch < maxBatches; batch += 1) {
      // no-mistakes-disable-next-line query-reached-per-item: two fixed streams process capped pages whose mutation and durable checkpoint must commit together.
      const page = await cleanupPostModerationLedgerPage(kind, batchSize, cutoffId, lowerId) // oxlint-disable-line no-await-in-loop -- each committed checkpoint determines the next page.
      if (kind === 'superseded_versions') deletedVersions += page.changed
      else clearedPassEvidence += page.changed
      hasMore = page.hasMore
      if (!hasMore) break
    }
    if (hasMore) remainingKinds.push(kind)
  }
  return {
    deletedVersions,
    clearedPassEvidence,
    hasMore: remainingKinds.length > 0,
    remainingKinds,
  }
}
