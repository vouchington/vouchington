import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import { getMinUUIDv7ForDate } from '@modules/utils'
import { getRetentionCutoffDate, normalizeRetentionDays } from './cleanup-options.mts'
import { DEFAULT_BATCH_SIZE } from './cleanup-batches.mts'
import { assertPositiveInteger, normalizePositiveInteger } from './normalize-positive-integer.mts'

type ModerationOperation = 'claims' | 'reveals'

type CleanupOptions = {
  retentionDays?: number
  batchSize?: number
  maxBatches: number
  lowerBoundDate?: Date
  now?: Date
}

type CleanupResult = {
  deleted: number
  hasMore: boolean
  cursorId: string | null
}

const TABLES = {
  claims: {
    source: 'moderation_queue_claims',
    cursor: 'moderation_queue_claim_cleanup_cursors',
    cursorColumn: 'cursor_claim_id',
    activityColumn: 'claimed_at',
    retentionDays: 1,
  },
  reveals: {
    source: 'moderation_media_reveals',
    cursor: 'moderation_media_reveal_cleanup_cursors',
    cursorColumn: 'cursor_reveal_id',
    activityColumn: 'revealed_at',
    retentionDays: 7,
  },
} as const

export function cleanupOldModerationQueueClaims(options: CleanupOptions): Promise<CleanupResult> {
  return cleanupModerationOperation('claims', options)
}

export function cleanupOldModerationMediaReveals(options: CleanupOptions): Promise<CleanupResult> {
  return cleanupModerationOperation('reveals', options)
}

async function cleanupModerationOperation(
  operation: ModerationOperation,
  options: CleanupOptions,
): Promise<CleanupResult> {
  const config = TABLES[operation]
  const retentionDays = normalizeRetentionDays(options.retentionDays, config.retentionDays)
  const requestedCutoffDate = getRetentionCutoffDate(retentionDays, options.now)
  const lowerBoundId = options.lowerBoundDate
    ? getMinUUIDv7ForDate(options.lowerBoundDate)
    : undefined
  const batchSize = normalizePositiveInteger(options.batchSize, DEFAULT_BATCH_SIZE, 'batchSize')
  const maxBatches = assertPositiveInteger(options.maxBatches, 'maxBatches')
  let deleted = 0
  let hasMore = false
  let cursorId: string | null = null
  /* oxlint-disable no-await-in-loop -- each committed page advances the durable cursor before the next page. */
  for (let batch = 0; batch < maxBatches; batch += 1) {
    // no-mistakes-disable-next-line query-reached-per-item: each capped page commits deletion and cursor before the next keyset page.
    const result = await deleteModerationOperationBatch(
      operation,
      requestedCutoffDate,
      batchSize,
      lowerBoundId,
    )
    deleted += result.deleted
    hasMore = result.hasMore
    cursorId = result.cursorId
    if (!hasMore) break
  }
  /* oxlint-enable no-await-in-loop */
  return { deleted, hasMore, cursorId }
}

async function deleteModerationOperationBatch(
  operation: ModerationOperation,
  requestedCutoffDate: Date,
  batchSize: number,
  lowerBoundId?: string,
): Promise<CleanupResult> {
  const config = TABLES[operation]
  await using query = await beginTransaction()
  await query(
    `/* ensureModerationOperationCleanupCursor */
     INSERT INTO ${config.cursor} (is_singleton) VALUES (TRUE) ON CONFLICT DO NOTHING`,
  )
  const { rows: cursorRows } = await query<{
    cursor_id: string | null
    sweep_cutoff_at: Date | null
  }>(
    `/* lockModerationOperationCleanupCursor */
     SELECT ${config.cursorColumn} AS cursor_id, sweep_cutoff_at FROM ${config.cursor}
     WHERE is_singleton FOR UPDATE`,
  )
  const cursorId = cursorRows[0]?.cursor_id ?? null
  const cutoffDate = cursorRows[0]?.sweep_cutoff_at ?? requestedCutoffDate
  const cutoffId = getMinUUIDv7ForDate(cutoffDate)
  const candidates = await listCandidates(
    query,
    config.source,
    cutoffId,
    batchSize,
    cursorId,
    lowerBoundId,
  )
  const page = candidates.slice(0, batchSize)
  const pageIds = page.map(row => row.id)
  // A claim can be renewed on its original id; a reveal may carry a later revealed_at.
  // Check the mutable activity time while holding the candidate locks.
  const { rowCount } = await query(
    `/* deleteOldModerationOperationPage */
     DELETE FROM ${config.source}
     WHERE id = ANY($1::uuid[]) AND ${config.activityColumn} < $2::timestamptz`,
    [pageIds, cutoffDate],
  )
  const hasMore = candidates.length > batchSize
  const nextCursorId = hasMore ? page.at(-1)!.id : null
  await query(
    `/* checkpointModerationOperationCleanup */
     UPDATE ${config.cursor}
     SET ${config.cursorColumn} = $1::uuid, sweep_cutoff_at = $2::timestamptz
     WHERE is_singleton`,
    [nextCursorId, hasMore ? cutoffDate : null],
  )
  await query.commit()
  return { deleted: rowCount ?? 0, hasMore, cursorId: nextCursorId }
}

async function listCandidates(
  query: TransactionQuery,
  source: string,
  cutoffId: string,
  batchSize: number,
  cursorId?: string | null,
  lowerBoundId?: string,
): Promise<{ id: string }[]> {
  const predicates = ['id < $1::uuid']
  const parameters: (string | number)[] = [cutoffId]
  if (cursorId) {
    parameters.push(cursorId)
    predicates.push(`id > $${parameters.length}::uuid`)
  }
  if (lowerBoundId) {
    parameters.push(lowerBoundId)
    predicates.push(`id >= $${parameters.length}::uuid`)
  }
  parameters.push(batchSize + 1)
  const { rows } = await query<{ id: string }>(
    `/* listModerationOperationCleanupCandidates */
     SELECT id FROM ${source}
     WHERE ${predicates.join(' AND ')}
     ORDER BY id LIMIT $${parameters.length} FOR UPDATE`,
    parameters,
  )
  return rows
}
