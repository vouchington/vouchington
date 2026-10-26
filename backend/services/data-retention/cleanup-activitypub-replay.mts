/* oxlint-disable no-await-in-loop -- each capped ledger page advances its durable rejection floor before the next page. */
import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import { getMinUUIDv7ForDate } from '@modules/utils'
import { getMaximumActivityAgeDays } from '@services/ap-inbox-activities/config'
import { advanceReplayRejectionFloor } from './cleanup-activitypub-replay-floor.mts'

type Kind = 'inbox' | 'outbound'
// Keep PostgreSQL's microsecond timestamp text when reporting the last deleted row.
type Key = { at: string; id: string }
export type ReplayCleanupPage = {
  deleted: number
  hasMore: boolean
  continuationPosition: Key | null
}
export type ReplayCleanupScope = { activityIds: readonly string[] }

const SOURCE = {
  inbox: {
    table: 'activitypub_inbox_activities',
    date: 'received_at',
    id: 'id',
    age: 'id',
    ageCast: 'uuid',
    order: 'id',
    condition: '',
  },
  outbound: {
    table: 'activitypub_distribution_work_items',
    date: 'completed_at',
    id: 'activity_id',
    age: 'completed_at',
    ageCast: 'timestamptz',
    order: 'completed_at, activity_id',
    condition: 'AND completed_at IS NOT NULL',
  },
} as const

/** Delete oldest eligible ledger rows in bounded pages; the durable floor survives policy changes. */
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
  cutoff: Date,
  query: TransactionQuery,
): Promise<ReplayCleanupPage> {
  const source = SOURCE[kind]
  const isOutbound = kind === 'outbound'
  const ageBound = isOutbound
    ? cutoff
    : getMinUUIDv7ForDate(new Date(Math.max(0, cutoff.getTime())))
  await query(
    `/* ensureActivityPubReplayRejectionFloor */
     INSERT INTO activitypub_replay_rejection_floors (is_outbound) VALUES ($1)
     ON CONFLICT (is_outbound) DO NOTHING`,
    [isOutbound],
  )
  await query(
    `/* lockActivityPubReplayRejectionFloorForCleanup */
     SELECT is_outbound FROM activitypub_replay_rejection_floors
     WHERE is_outbound = $1 FOR UPDATE`,
    [isOutbound],
  )

  let deleted = 0
  let hasMore = false
  let continuationPosition: Key | null = null
  for (let batch = 0; batch < options.maxBatches; batch += 1) {
    // The inbox UUIDv7 primary key and outbound completion index supply oldest eligible rows.
    // no-mistakes-disable-next-line query-reached-per-item: capped oldest eligible ledger page
    const { rows } = await query<Key>(
      `/* no-mistakes: deadlock-safe -- the floor row is locked first, then one ordered indexed ledger page; waiting preserves contiguous floor advancement. */
       /* listActivityPubReplayRetentionCandidates */
       SELECT ${source.date}::text AS at, ${source.id} AS id FROM ${source.table}
       WHERE ${source.age} < $1::${source.ageCast} ${source.condition}
         ${options.scope ? `AND ${source.id} = ANY($3::uuid[])` : ''}
       ORDER BY ${source.order} LIMIT $2 FOR UPDATE`,
      [ageBound, options.batchSize + 1, ...(options.scope ? [options.scope.activityIds] : [])],
    )
    const page = rows.slice(0, options.batchSize)
    if (page.length === 0) {
      hasMore = false
      continuationPosition = null
      break
    }
    // no-mistakes-disable-next-line query-reached-per-item: selected capped UUID page
    const removed = await query<Key>(
      `/* deleteActivityPubReplayRetentionCandidates */
       DELETE FROM ${source.table} WHERE ${source.id} = ANY($1::uuid[])
         AND ${source.age} < $2::${source.ageCast} ${source.condition}
         ${options.scope ? `AND ${source.id} = ANY($3::uuid[])` : ''}
       RETURNING ${source.date}::text AS at, ${source.id} AS id`,
      [page.map(item => item.id), ageBound, ...(options.scope ? [options.scope.activityIds] : [])],
    )
    // Admission holds a share lock on the same floor row. Deletion and floor advance commit together.
    // no-mistakes-disable-next-line query-reached-per-item: one durable floor update per capped page
    if (removed.rows.length > 0) await advanceReplayRejectionFloor(query, kind, removed.rows)
    deleted += removed.rowCount ?? 0
    hasMore = rows.length > options.batchSize
    continuationPosition = hasMore ? page.at(-1)! : null
    if (!hasMore) break
  }
  return { deleted, hasMore, continuationPosition }
}
