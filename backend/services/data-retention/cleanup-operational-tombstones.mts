/* oxlint-disable no-await-in-loop -- each capped page commits before the next keyset page. */
import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import { assertPositiveInteger, normalizePositiveInteger } from './normalize-positive-integer.mts'
import { cleanupDeletedConversationPage } from './cleanup-deleted-conversations.mts'
import { listCandidates } from './cleanup-operational-tombstone-candidates.mts'
import {
  detachHostnameBlockReferences,
  hasIncompleteHostnameCleanupRoot,
} from './cleanup-hostname-block-references.mts'
import { getPlanCutoffDate, PLANS, type Family } from './cleanup-operational-tombstone-plans.mts'
import type {
  OperationalTombstoneCleanupResult,
  OperationalTombstoneCursor,
  OperationalTombstonePageResult,
} from './cleanup-operational-tombstone-types.mts'

type CleanupOptions = {
  batchSize?: number
  maxBatches: number
  now?: Date
}

/** Each capped page commits; only protected actor rows require a persisted sweep position. */
export async function cleanupOperationalTombstones(
  family: Family,
  options: CleanupOptions,
): Promise<OperationalTombstoneCleanupResult> {
  return cleanupOperationalTombstonePages(family, options, beginTransaction)
}

/** Real page transaction composition, shared by production and strict owned-row fixture adapters. */
export async function cleanupOperationalTombstonePages(
  family: Family,
  options: CleanupOptions,
  openTransaction: typeof beginTransaction,
): Promise<OperationalTombstoneCleanupResult> {
  const batchSize = normalizePositiveInteger(options.batchSize, 500, 'batchSize')
  const maxBatches = assertPositiveInteger(options.maxBatches, 'maxBatches')
  let deleted = 0
  let hasMore = false
  let stalled = false
  let continuation: OperationalTombstoneCleanupResult['continuation'] = null
  for (let batch = 0; batch < maxBatches; batch += 1) {
    await using query = await openTransaction()
    const result = await cleanupOperationalTombstonePage(query, family, batchSize, options) // no-mistakes-disable-line query-reached-per-item: each physical capped page and cursor checkpoint commits before the next transaction
    await query.commit()
    deleted += result.deleted
    hasMore = result.hasMore
    stalled = result.stalled
    continuation = result.continuation
    if (!hasMore || result.stalled) break
  }
  return { deleted, hasMore, continuation, ...(stalled ? { stalled: true as const } : {}) }
}

export async function cleanupOperationalTombstonePage(
  query: TransactionQuery,
  family: Family,
  batchSize: number,
  options: Pick<CleanupOptions, 'now'>,
): Promise<OperationalTombstonePageResult> {
  if (family === 'deleted_conversations')
    return cleanupDeletedConversationPage(query, batchSize, options)
  const plan = PLANS[family]
  const hostnameBlocks = family === 'feed_hostname_blocks' || family === 'other_hostname_blocks'
  const trackCursor = family === 'remote_actors' || hostnameBlocks
  let cursor: OperationalTombstoneCursor = {
    cursor_at: null,
    cursor_record_id: null,
    sweep_cutoff_at: null,
  }
  if (trackCursor) {
    await query(
      `/* ensureOperationalTombstoneCursor */
     INSERT INTO operational_tombstone_retention_cursors (cleanup_name)
     VALUES ($1) ON CONFLICT DO NOTHING`,
      [family],
    )
    cursor = (
      await query<OperationalTombstoneCursor>(
        `/* lockOperationalTombstoneCursor */
       SELECT cursor_at::text AS cursor_at, cursor_record_id, sweep_cutoff_at
       FROM operational_tombstone_retention_cursors
       WHERE cleanup_name = $1 FOR UPDATE`,
        [family],
      )
    ).rows[0]
  }
  const cutoff = cursor.sweep_cutoff_at ?? getPlanCutoffDate(plan, options.now)
  // One root at a time: the same page budget first detaches its FK dependents.
  const pageSize = hostnameBlocks ? 1 : batchSize
  const candidates = await listCandidates(query, plan, cutoff, pageSize + 1, cursor)
  const page = candidates.slice(0, pageSize)
  if (hostnameBlocks && page[0]) {
    if (await hasIncompleteHostnameCleanupRoot(query, page[0].id)) {
      const more = candidates.length > pageSize
      await query(
        `/* skipProtectedHostnameBlockRetentionCursor */
         UPDATE operational_tombstone_retention_cursors
         SET cursor_at = $2::timestamptz, cursor_record_id = $3::uuid,
             sweep_cutoff_at = $4::timestamptz
         WHERE cleanup_name = $1`,
        [family, more ? page[0].position_at : null, more ? page[0].id : null, more ? cutoff : null],
      )
      return {
        deleted: 0,
        hasMore: more,
        continuation: more ? { at: page[0].position_at, id: page[0].id } : null,
        stalled: false,
      }
    }
    const references = await detachHostnameBlockReferences(query, page[0].id, batchSize)
    if (references.remain)
      return {
        deleted: 0,
        hasMore: true,
        continuation: { at: page[0].position_at, id: page[0].id },
        stalled: !references.progressed,
      }
  }
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
  const hasMore = candidates.length > pageSize
  const last = hasMore ? page.at(-1)! : null
  if (trackCursor)
    await query(
      `/* checkpointOperationalTombstoneCursor */
     UPDATE operational_tombstone_retention_cursors
     SET cursor_at = $2::timestamptz, cursor_record_id = $3::uuid, sweep_cutoff_at = $4::timestamptz
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
