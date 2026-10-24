/* oxlint-disable no-await-in-loop -- each capped page commits before the next keyset page. */
import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import { assertPositiveInteger, normalizePositiveInteger } from './normalize-positive-integer.mts'
import { cleanupDeletedConversationPage } from './cleanup-deleted-conversations.mts'
import { listCandidates } from './cleanup-operational-tombstone-candidates.mts'
import {
  getPlanCutoffDate,
  PLANS,
  type Family,
  type GenericFamily,
} from './cleanup-operational-tombstone-plans.mts'
export type OperationalTombstoneCleanupResult = {
  deleted: number
  hasMore: boolean
  continuation: { at: string; id: string } | null
}
export type OperationalTombstonePageResult = OperationalTombstoneCleanupResult & {
  stalled: boolean
}

type CleanupOptions = {
  batchSize?: number
  maxBatches: number
  now?: Date
  lowerBoundDate?: Date
  borrowedQuery?: TransactionQuery
}
export type Cursor = {
  cursor_at: string | null
  cursor_id: string | null
  sweep_cutoff_at: Date | null
}
export type Candidate = { id: string; position_at: string }

/** Each page and its cursor checkpoint commit together; a capped run resumes next daily tick. */
export async function cleanupOperationalTombstones(
  family: Family,
  options: CleanupOptions,
): Promise<OperationalTombstoneCleanupResult> {
  const batchSize = normalizePositiveInteger(options.batchSize, 500, 'batchSize')
  const maxBatches = assertPositiveInteger(options.maxBatches, 'maxBatches')
  let deleted = 0
  let hasMore = false
  let continuation: OperationalTombstoneCleanupResult['continuation'] = null
  for (let batch = 0; batch < maxBatches; batch += 1) {
    const result =
      family === 'deleted_conversations'
        ? await cleanupDeletedConversationPage(batchSize, options) // no-mistakes-disable-line query-reached-per-item: each bounded conversation stage commits with its cursor before the next page
        : await cleanupPage(family, batchSize, options) // no-mistakes-disable-line query-reached-per-item: each bounded indexed page commits with its cursor before the next page
    deleted += result.deleted
    hasMore = result.hasMore
    continuation = result.continuation
    if (!hasMore || result.stalled) break
  }
  return { deleted, hasMore, continuation }
}

async function cleanupPage(
  family: GenericFamily,
  batchSize: number,
  options: CleanupOptions,
): Promise<OperationalTombstonePageResult> {
  if (options.borrowedQuery)
    return cleanupPageWithQuery(family, batchSize, options, options.borrowedQuery)
  await using query = await beginTransaction()
  const result = await cleanupPageWithQuery(family, batchSize, options, query)
  await query.commit()
  return result
}

async function cleanupPageWithQuery(
  family: GenericFamily,
  batchSize: number,
  options: CleanupOptions,
  query: TransactionQuery,
): Promise<OperationalTombstonePageResult> {
  const plan = PLANS[family]
  const trackCursor = options.borrowedQuery !== undefined || options.lowerBoundDate === undefined
  let cursor: Cursor = { cursor_at: null, cursor_id: null, sweep_cutoff_at: null }
  if (trackCursor) {
    await query(
      `/* ensureOperationalTombstoneCursor */
     INSERT INTO operational_tombstone_retention_cursors (cleanup_name)
     VALUES ($1) ON CONFLICT DO NOTHING`,
      [family],
    )
    cursor = (
      await query<Cursor>(
        `/* lockOperationalTombstoneCursor */
       SELECT cursor_at::text AS cursor_at, cursor_id, sweep_cutoff_at
       FROM operational_tombstone_retention_cursors
       WHERE cleanup_name = $1 FOR UPDATE`,
        [family],
      )
    ).rows[0]
  }
  const cutoff = cursor.sweep_cutoff_at ?? getPlanCutoffDate(plan, options.now)
  const candidates = await listCandidates(
    query,
    plan,
    cutoff,
    batchSize + 1,
    cursor,
    options.lowerBoundDate,
  )
  const page = candidates.slice(0, batchSize)
  const { rowCount } = page.length
    ? await query(
        `/* deleteOperationalTombstonePage */
         DELETE FROM ${plan.table} source
         WHERE source.id = ANY($1::uuid[])
           AND ${plan.timestamp} < $2::timestamptz
           AND ${plan.predicate}`,
        [page.map(candidate => candidate.id), cutoff],
      )
    : { rowCount: 0 }
  const hasMore = candidates.length > batchSize
  const last = hasMore ? page.at(-1)! : null
  if (trackCursor)
    await query(
      `/* checkpointOperationalTombstoneCursor */
     UPDATE operational_tombstone_retention_cursors
     SET cursor_at = $2::timestamptz, cursor_id = $3::uuid, sweep_cutoff_at = $4::timestamptz
     WHERE cleanup_name = $1`,
      [family, last?.position_at ?? null, last?.id ?? null, last ? cutoff : null],
    )
  return {
    deleted: rowCount ?? 0,
    hasMore,
    continuation: last ? { at: last.position_at, id: last.id } : null,
    stalled: false,
  }
}
