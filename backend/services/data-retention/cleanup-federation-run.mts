/* oxlint-disable no-await-in-loop -- each capped follower page must finish before its cursor advances. */
import type { TransactionQuery } from '@data-stores/psql'
import {
  findRetentionUpperBound,
  listRetentionCandidates,
} from './cleanup-federation-candidates.mts'
import { deleteRetentionCandidates } from './cleanup-federation-delete.mts'
import type {
  FederationRetentionCursor,
  FederationRetentionPage,
  FederationRetentionScope,
} from './cleanup-federation.types.mts'

const DAY_MS = 24 * 60 * 60 * 1_000

export async function cleanupSweepWithQuery(
  options: { batchSize: number; maxBatches: number; now?: Date; scope?: FederationRetentionScope },
  query: TransactionQuery,
): Promise<FederationRetentionPage> {
  const cutoff = new Date((options.now ?? new Date()).getTime() - 7 * DAY_MS)
  await query(
    `/* ensureFollowerDistributionRetentionCursor */
     INSERT INTO follower_distribution_retention_cursors (is_singleton) VALUES (TRUE)
     ON CONFLICT (is_singleton) DO NOTHING`,
  )
  const row = (
    await query<{
      sweep_cutoff_at: Date | null
      cursor_distribution_id: string | null
      sweep_upper_bound_distribution_id: string | null
    }>(
      `/* lockFollowerDistributionRetentionCursor */
       SELECT sweep_cutoff_at, cursor_distribution_id, sweep_upper_bound_distribution_id
       FROM follower_distribution_retention_cursors WHERE is_singleton FOR UPDATE`,
    )
  ).rows[0]
  if (!row) throw new Error('Missing follower-distribution retention cursor')

  let progress: FederationRetentionCursor | null = null
  if (row.sweep_cutoff_at) {
    if (!row.sweep_upper_bound_distribution_id)
      throw new Error('Missing follower-distribution retention upper bound')
    progress = {
      cutoffAt: row.sweep_cutoff_at,
      cursorId: row.cursor_distribution_id,
      upperBoundId: row.sweep_upper_bound_distribution_id,
    }
  } else {
    const upperBound = await findRetentionUpperBound(query, cutoff, options.scope)
    if (!upperBound) return emptyPage()
    progress = { cutoffAt: cutoff, cursorId: null, upperBoundId: upperBound.id }
  }

  let currentProgress = progress!
  let deleted = 0
  let hasMore = false
  for (let batch = 0; batch < options.maxBatches; batch += 1) {
    // Each bounded page observes the prior in-transaction cursor update; one sweep commits at the end.
    // no-mistakes-disable-next-line query-reached-per-item: capped indexed page depends on prior cursor
    const candidates = await listRetentionCandidates(
      query,
      currentProgress.cutoffAt,
      currentProgress.cursorId,
      currentProgress.upperBoundId,
      options.batchSize + 1,
      options.scope,
    )
    const page = candidates.slice(0, options.batchSize)
    if (page.length === 0) {
      // Persist completion even when another worker removed the last selected candidate.
      progress = null
      // no-mistakes-disable-next-line query-reached-per-item: final cursor checkpoint follows empty capped page
      await persistProgress(query, null)
      hasMore = false
      break
    }
    // no-mistakes-disable-next-line query-reached-per-item: capped parent page deletes before cursor advances
    deleted += await deleteRetentionCandidates(
      query,
      currentProgress.cutoffAt,
      page,
      options.batchSize,
    )
    hasMore = candidates.length > options.batchSize
    if (hasMore) {
      currentProgress = {
        cutoffAt: currentProgress.cutoffAt,
        cursorId: page.at(-1)!.id,
        upperBoundId: currentProgress.upperBoundId,
      }
    }
    progress = hasMore ? currentProgress : null
    // no-mistakes-disable-next-line query-reached-per-item: one cursor checkpoint orders next capped page
    await persistProgress(query, progress)
    if (!hasMore) break
  }
  return {
    deleted,
    hasMore,
    continuationPosition: hasMore ? { id: progress!.cursorId! } : null,
  }
}

async function persistProgress(
  query: TransactionQuery,
  progress: FederationRetentionCursor | null,
): Promise<void> {
  await query(
    `/* advanceFollowerDistributionRetentionCursor */
     UPDATE follower_distribution_retention_cursors
     SET sweep_cutoff_at = $1, cursor_distribution_id = $2, sweep_upper_bound_distribution_id = $3
     WHERE is_singleton`,
    [progress?.cutoffAt ?? null, progress?.cursorId ?? null, progress?.upperBoundId ?? null],
  )
}

function emptyPage(): FederationRetentionPage {
  return { deleted: 0, hasMore: false, continuationPosition: null }
}
