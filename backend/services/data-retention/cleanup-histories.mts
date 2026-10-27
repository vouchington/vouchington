import { beginTransaction } from '@data-stores/psql'
import { getMinUUIDv7ForDate } from '@modules/utils'
import { assertPositiveInteger, normalizePositiveInteger } from './normalize-positive-integer.mts'
import { DEFAULT_BATCH_SIZE } from './cleanup-batches.mts'
import { getRetentionCutoffDate } from './cleanup-options.mts'
import {
  HISTORY_KINDS,
  hasMonotonicEligibility,
  listRawCandidates,
  listResidualCandidate,
  type HistoryKind,
} from './cleanup-histories-candidates.mts'
import { mutatePage } from './cleanup-histories-queries.mts'

export type { HistoryKind } from './cleanup-histories-candidates.mts'
export type HistoryCleanupResult = { scanned: number; changed: number; hasMore: boolean }
export type HistoryCleanupOptions = {
  batchSize?: number
  maxBatches: number
  now?: Date
  /** Isolates a test's synthetic UUIDv7 range without changing the production checkpoint. */
  lowerBoundDate?: Date
  upperBoundDate?: Date
  /** Exercises the durable cursor inside a synthetic, owned range. */
  persistentCursorForTest?: boolean
}

/** Every family gets an independent persisted raw-row cursor and a fixed end for each pass. */
export async function cleanupHistories(
  options: HistoryCleanupOptions,
): Promise<Record<HistoryKind, HistoryCleanupResult>> {
  const results = {} as Record<HistoryKind, HistoryCleanupResult>
  for (const kind of HISTORY_KINDS) {
    // no-mistakes-disable-next-line query-reached-per-item: fixed eight-family sweep, each with its own persisted cursor and bounded page budget.
    results[kind] = await cleanupHistory(kind, options) // oxlint-disable-line no-await-in-loop -- independent bounded passes share the daily retention budget
  }
  return results
}

export async function cleanupHistory(
  kind: HistoryKind,
  options: HistoryCleanupOptions,
): Promise<HistoryCleanupResult> {
  const batchSize = normalizePositiveInteger(options.batchSize, DEFAULT_BATCH_SIZE, 'batchSize')
  const maxBatches = assertPositiveInteger(options.maxBatches, 'maxBatches')
  const now = options.now ?? new Date()
  const cutoff = cutoffFor(kind, now)
  const lowerBoundId = options.lowerBoundDate ? getMinUUIDv7ForDate(options.lowerBoundDate) : null
  const upperBoundId = options.upperBoundDate ? getMinUUIDv7ForDate(options.upperBoundDate) : null
  let scanned = 0
  let changed = 0
  let hasMore = false
  let testCursorId: string | null = null
  /* oxlint-disable no-await-in-loop -- each page commits its mutation with its checkpoint */
  for (let batch = 0; batch < maxBatches; batch++) {
    // no-mistakes-disable-next-line query-reached-per-item: bounded page loop, one transaction and checkpoint per raw candidate page.
    const page = await cleanupHistoryPage(
      kind,
      batchSize,
      cutoff,
      lowerBoundId,
      upperBoundId,
      testCursorId,
      options.persistentCursorForTest === true,
    )
    scanned += page.scanned
    changed += page.changed
    hasMore = page.hasMore
    testCursorId = page.cursorId
    if (!hasMore) break
  }
  /* oxlint-enable no-await-in-loop */
  return { scanned, changed, hasMore }
}

function cutoffFor(kind: HistoryKind, now: Date): Date {
  switch (kind) {
    case 'dynamic_configuration_revisions':
    case 'fediverse_instance_integration_changes':
      return subtractUtcMonths(now, 12)
    case 'rss_feed_setting_changes':
    case 'referral_attribution_scrub':
      return getRetentionCutoffDate(90, now)
    case 'followed_user_import_requests':
      return now
    case 'pending_user_import_requests':
      return getRetentionCutoffDate(180, now)
    case 'referral_attribution_expiry':
      return subtractUtcMonths(now, 24)
    case 'community_agent_prompt_revisions':
      return now
  }
}

function subtractUtcMonths(now: Date, months: number): Date {
  const firstOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, 1))
  const daysInMonth = new Date(
    Date.UTC(firstOfMonth.getUTCFullYear(), firstOfMonth.getUTCMonth() + 1, 0),
  ).getUTCDate()
  firstOfMonth.setUTCDate(Math.min(now.getUTCDate(), daysInMonth))
  firstOfMonth.setUTCHours(
    now.getUTCHours(),
    now.getUTCMinutes(),
    now.getUTCSeconds(),
    now.getUTCMilliseconds(),
  )
  return firstOfMonth
}

type Page = HistoryCleanupResult & { cursorId: string | null }

async function cleanupHistoryPage(
  kind: HistoryKind,
  batchSize: number,
  cutoff: Date,
  lowerBoundId: string | null,
  upperBoundId: string | null,
  testCursorId: string | null,
  persistentCursorForTest: boolean,
): Promise<Page> {
  await using transaction = await beginTransaction()
  const persistent = lowerBoundId === null || persistentCursorForTest
  let cursorId = testCursorId
  let sweepCutoffId = getMinUUIDv7ForDate(cutoff)
  let sweepComplete = false
  if (upperBoundId && upperBoundId < sweepCutoffId) sweepCutoffId = upperBoundId
  if (persistent) {
    await transaction(
      `/* ensureHistoryRetentionCursor */
       INSERT INTO history_retention_cursors (cleanup_name)
       VALUES ($1::history_retention_cleanup_names) ON CONFLICT DO NOTHING`,
      [kind],
    )
    const { rows } = await transaction<{
      cursor_id: string | null
      sweep_cutoff_id: string | null
      is_sweep_complete: boolean
    }>(
      `/* lockHistoryRetentionCursor */
       SELECT cursor_id, sweep_cutoff_id, is_sweep_complete FROM history_retention_cursors
       WHERE cleanup_name = $1::history_retention_cleanup_names FOR UPDATE`,
      [kind],
    )
    if (!rows[0]) throw new Error(`${kind} history retention cursor is missing`)
    cursorId = rows[0].cursor_id
    sweepComplete = rows[0].is_sweep_complete
    const priorCutoffId = rows[0].sweep_cutoff_id
    if (priorCutoffId && (!sweepComplete || priorCutoffId > sweepCutoffId)) {
      sweepCutoffId = priorCutoffId
    }
  }
  // Followed-at may be later than id; mutation checks its age within each raw page.
  const monotonic = persistent && hasMonotonicEligibility(kind)
  const residual =
    monotonic && cursorId
      ? await listResidualCandidate(transaction, kind, cursorId, sweepCutoffId, lowerBoundId)
      : []
  const forwardBudget = batchSize - residual.length
  const rows =
    forwardBudget > 0
      ? await listRawCandidates(
          transaction,
          kind,
          cursorId,
          sweepCutoffId,
          lowerBoundId,
          forwardBudget + 1,
        )
      : []
  const forwardIds = rows.slice(0, forwardBudget).map(row => row.id)
  const pageIds = [...residual.map(row => row.id), ...forwardIds]
  // Recheck after a residual hit; an empty probe leaves room for forward work.
  const hasMore = residual.length > 0 || rows.length > forwardBudget
  let changed = 0
  if (pageIds.length > 0) {
    // This transaction-local flag is accepted only by the four named immutable history
    // tables; updates and all other tables still reject mutation.
    await transaction(
      `/* enableHistoryRetentionDelete */ SELECT set_config('app.history_retention_cleanup', 'on', true)`,
    )
    changed = await mutatePage(transaction, kind, pageIds, cutoff)
  }
  const nextCursorId = monotonic
    ? (forwardIds.at(-1) ?? cursorId)
    : hasMore
      ? forwardIds.at(-1)!
      : null
  if (persistent) {
    const { rowCount } = await transaction(
      `/* checkpointHistoryRetentionCursor */
       UPDATE history_retention_cursors
       SET cursor_id = $2::uuid, sweep_cutoff_id = $3::uuid, is_sweep_complete = $4::boolean
       WHERE cleanup_name = $1::history_retention_cleanup_names`,
      [kind, nextCursorId, monotonic || hasMore ? sweepCutoffId : null, !hasMore],
    )
    if (rowCount !== 1) throw new Error(`${kind} history retention checkpoint was not saved`)
  }
  await transaction.commit()
  return { scanned: pageIds.length, changed, hasMore, cursorId: nextCursorId }
}
