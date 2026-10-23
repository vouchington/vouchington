/* oxlint-disable no-await-in-loop -- each capped keyset page must finish before its cursor advances. */
import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import { getMaximumActivityAgeDays } from '@services/ap-inbox-activities/config'

type Kind = 'inbox' | 'outbound'
// PostgreSQL timestamps have microsecond precision. pg's Date parser truncates to milliseconds,
// which would make an exact high-water row disappear from the following tuple comparison.
type Key = { at: string; id: string }
type CursorRow = {
  sweep_cutoff_at: string | null
  cursor_at: string | null
  cursor_position: string | null
  upper_bound_at: string | null
  upper_bound_position: string | null
}
export type ReplayCleanupPage = {
  deleted: number
  hasMore: boolean
  continuationPosition: Key | null
}
export type ReplayCleanupScope = { activityIds: readonly string[] }

const SOURCE = {
  inbox: { table: 'activitypub_inbox_activities', date: 'received_at', id: 'id', condition: '' },
  outbound: {
    table: 'activitypub_distribution_work_items',
    date: 'completed_at',
    id: 'activity_id',
    condition: 'AND completed_at IS NOT NULL',
  },
} as const

/** Each ledger has a persisted high-water key. One call reads at most maxBatches pages plus one
 * lookahead row per page; changed dynamic policy never deletes inside a newly extended window.
 */
export async function cleanupActivityPubReplayLedger(
  kind: Kind,
  options: {
    batchSize: number
    maxBatches: number
    now?: Date
    borrowedQuery?: TransactionQuery
    scope?: ReplayCleanupScope
  },
): Promise<ReplayCleanupPage> {
  if (options.scope && !options.borrowedQuery)
    throw new TypeError('A scoped replay sweep requires a borrowed transaction')
  if (options.borrowedQuery && !options.scope)
    throw new TypeError('A borrowed replay sweep requires a source-row scope')
  const cutoff = new Date(
    (options.now ?? new Date()).getTime() - getMaximumActivityAgeDays() * 86_400_000,
  )
  await using ownedQuery = options.borrowedQuery ? undefined : await beginTransaction()
  const query = options.borrowedQuery ?? ownedQuery!
  const result = await cleanupWithQuery(kind, options, cutoff, query)
  if (ownedQuery) await ownedQuery.commit()
  return result
}

async function cleanupWithQuery(
  kind: Kind,
  options: { batchSize: number; maxBatches: number; scope?: ReplayCleanupScope },
  currentCutoff: Date,
  query: TransactionQuery,
): Promise<ReplayCleanupPage> {
  const source = SOURCE[kind]
  const isOutbound = kind === 'outbound'
  await query(
    `/* ensureActivityPubReplayRetentionCursor */
     INSERT INTO activitypub_replay_retention_cursors (is_outbound) VALUES ($1)
     ON CONFLICT (is_outbound) DO NOTHING`,
    [isOutbound],
  )
  const row = (
    await query<CursorRow>(
      `/* lockActivityPubReplayRetentionCursor */
       SELECT sweep_cutoff_at::text, cursor_at::text, cursor_position,
         upper_bound_at::text, upper_bound_position
       FROM activitypub_replay_retention_cursors WHERE is_outbound = $1 FOR UPDATE`,
      [isOutbound],
    )
  ).rows[0]
  if (!row) throw new Error('Missing ActivityPub replay-retention cursor')

  let cutoff = currentCutoff
  let position: Key | null = null
  let upper: Key | null = null
  // A larger configured age moves cutoff backward. Abandon the older pass so its former cutoff
  // cannot remove identities now protected by the extended window.
  if (row.sweep_cutoff_at && new Date(row.sweep_cutoff_at) <= currentCutoff) {
    cutoff = new Date(row.sweep_cutoff_at)
    position =
      row.cursor_at && row.cursor_position ? { at: row.cursor_at, id: row.cursor_position } : null
    upper =
      row.upper_bound_at && row.upper_bound_position
        ? { at: row.upper_bound_at, id: row.upper_bound_position }
        : null
    if (!upper) throw new Error('Incomplete ActivityPub replay-retention high-water key')
  } else {
    const { rows } = await query<Key>(
      `/* findActivityPubReplayRetentionUpperBound */
       SELECT ${source.date}::text AS at, ${source.id} AS id FROM ${source.table}
       WHERE ${source.date} < $1 ${source.condition}
         ${options.scope ? `AND ${source.id} = ANY($2::uuid[])` : ''}
       ORDER BY ${source.date} DESC, ${source.id} DESC LIMIT 1`,
      options.scope ? [cutoff, options.scope.activityIds] : [cutoff],
    )
    upper = rows[0] ?? null
  }
  if (!upper) {
    await persist(query, kind, null, null, null)
    return { deleted: 0, hasMore: false, continuationPosition: null }
  }

  let deleted = 0
  let hasMore = false
  for (let batch = 0; batch < options.maxBatches; batch += 1) {
    // no-mistakes-disable-next-line query-reached-per-item: capped indexed page depends on prior cursor
    const { rows } = await query<Key>(
      `/* listActivityPubReplayRetentionCandidates */
       SELECT ${source.date}::text AS at, ${source.id} AS id FROM ${source.table}
       WHERE ${source.date} < $1 ${source.condition}
         AND ($2::timestamptz IS NULL OR (${source.date}, ${source.id}) > ($2, $3::uuid))
         AND (${source.date}, ${source.id}) <= ($4::timestamptz, $5::uuid)
         ${options.scope ? `AND ${source.id} = ANY($7::uuid[])` : ''}
       ORDER BY ${source.date}, ${source.id} LIMIT $6`,
      [
        cutoff,
        position?.at ?? null,
        position?.id ?? null,
        upper.at,
        upper.id,
        options.batchSize + 1,
        ...(options.scope ? [options.scope.activityIds] : []),
      ],
    )
    const page = rows.slice(0, options.batchSize)
    if (page.length === 0) {
      hasMore = false
      break
    }
    // no-mistakes-disable-next-line query-reached-per-item: capped UUID page deletes before cursor advances
    const removed = await query(
      `/* deleteActivityPubReplayRetentionCandidates */
       DELETE FROM ${source.table} WHERE ${source.id} = ANY($1::uuid[])
         AND ${source.date} < $2 ${source.condition}
         ${options.scope ? `AND ${source.id} = ANY($3::uuid[])` : ''}`,
      [page.map(item => item.id), cutoff, ...(options.scope ? [options.scope.activityIds] : [])],
    )
    deleted += removed.rowCount ?? 0
    position = page.at(-1)!
    hasMore = rows.length > options.batchSize
    if (!hasMore) break
  }
  // If the final allowed batch had no lookahead, the fixed high-water range is exhausted.
  await persist(
    query,
    kind,
    hasMore ? cutoff : null,
    hasMore ? position : null,
    hasMore ? upper : null,
  )
  return { deleted, hasMore, continuationPosition: hasMore ? position : null }
}

async function persist(
  query: TransactionQuery,
  kind: Kind,
  cutoff: Date | null,
  position: Key | null,
  upper: Key | null,
): Promise<void> {
  await query(
    `/* advanceActivityPubReplayRetentionCursor */
     UPDATE activitypub_replay_retention_cursors SET sweep_cutoff_at = $2,
       cursor_at = $3, cursor_position = $4, upper_bound_at = $5, upper_bound_position = $6
     WHERE is_outbound = $1`,
    [
      kind === 'outbound',
      cutoff,
      position?.at ?? null,
      position?.id ?? null,
      upper?.at ?? null,
      upper?.id ?? null,
    ],
  )
}
