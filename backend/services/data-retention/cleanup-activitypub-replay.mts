/* oxlint-disable no-await-in-loop -- each capped ledger page advances its durable rejection floor before the next page. */
import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import { getMinUUIDv7ForDate } from '@modules/utils'
import { getMaximumActivityAgeDays } from '@services/ap-inbox-activities/config'
import { assertPositiveInteger } from './normalize-positive-integer.mts'
import { advanceReplayRejectionFloor } from './cleanup-activitypub-replay-floor.mts'

type Kind = 'inbox' | 'outbound'
// Keep PostgreSQL's microsecond timestamp text when reporting the last deleted row.
type Key = { at: string; id: string }
export type ReplayCleanupPage = {
  deleted: number
  hasMore: boolean
  continuationPosition: Key | null
}

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

/** Each capped ledger page and its floor advance commit before the next page begins. */
export async function cleanupActivityPubReplayLedger(
  kind: Kind,
  options: { batchSize: number; maxBatches: number; now?: Date },
): Promise<ReplayCleanupPage> {
  return cleanupActivityPubReplayPages(kind, options, beginTransaction)
}

/** The bounded page protocol owns each transaction; SQL callers supply the normal DB opener. */
export async function cleanupActivityPubReplayPages(
  kind: Kind,
  options: { batchSize: number; maxBatches: number; now?: Date },
  openTransaction: typeof beginTransaction,
): Promise<ReplayCleanupPage> {
  assertPositiveInteger(options.batchSize, 'batchSize')
  assertPositiveInteger(options.maxBatches, 'maxBatches')
  const cutoff = new Date(
    (options.now ?? new Date()).getTime() - getMaximumActivityAgeDays() * 86_400_000,
  )
  let deleted = 0
  let page: ReplayCleanupPage = { deleted: 0, hasMore: false, continuationPosition: null }
  for (let batch = 0; batch < options.maxBatches; batch += 1) {
    await using query = await openTransaction()
    // no-mistakes-disable-next-line query-reached-per-item: each capped page must commit its floor before the next page opens; one sweep-wide transaction violates ingress lock bounds
    page = await cleanupActivityPubReplayPage(query, kind, { batchSize: options.batchSize, cutoff })
    await query.commit()
    deleted += page.deleted
    if (!page.hasMore) break
  }
  return { ...page, deleted }
}

/** One real SQL page, called inside the short production transaction. */
export async function cleanupActivityPubReplayPage(
  query: TransactionQuery,
  kind: Kind,
  options: { batchSize: number; cutoff: Date },
): Promise<ReplayCleanupPage> {
  const cutoff = options.cutoff
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
  // The inbox UUIDv7 primary key and outbound completion index supply oldest eligible rows.
  // no-mistakes-disable-next-line query-reached-per-item: capped oldest eligible ledger page
  const { rows } = await query<Key>(
    `/* no-mistakes: deadlock-safe -- the floor row is locked first, then one ordered indexed ledger page; waiting preserves contiguous floor advancement. */
       /* listActivityPubReplayRetentionCandidates */
       SELECT ${source.date}::text AS at, ${source.id} AS id FROM ${source.table}
       WHERE ${source.age} < $1::${source.ageCast} ${source.condition}
       ORDER BY ${source.order} LIMIT $2 FOR UPDATE`,
    [ageBound, options.batchSize + 1],
  )
  const page = rows.slice(0, options.batchSize)
  if (page.length === 0) {
    return { deleted: 0, hasMore: false, continuationPosition: null }
  }
  // no-mistakes-disable-next-line query-reached-per-item: selected capped UUID page
  const removed = await query<Key>(
    `/* deleteActivityPubReplayRetentionCandidates */
       DELETE FROM ${source.table} WHERE ${source.id} = ANY($1::uuid[])
         AND ${source.age} < $2::${source.ageCast} ${source.condition}
       RETURNING ${source.date}::text AS at, ${source.id} AS id`,
    [page.map(item => item.id), ageBound],
  )
  // Admission holds a share lock on the same floor row. Deletion and floor advance commit together.
  // no-mistakes-disable-next-line query-reached-per-item: one durable floor update per capped page
  if (removed.rows.length > 0) await advanceReplayRejectionFloor(query, kind, removed.rows)
  const hasMore = rows.length > options.batchSize
  return {
    deleted: removed.rowCount ?? 0,
    hasMore,
    continuationPosition: hasMore ? page.at(-1)! : null,
  }
}
