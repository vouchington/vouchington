/* oxlint-disable no-await-in-loop -- each capped ledger page advances its durable rejection floor before the next page. */
import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import { getMinUUIDv7ForDate } from '@modules/utils'
import { getMaximumActivityAgeDays } from '@services/ap-inbox-activities/config'
import { assertPositiveInteger } from './normalize-positive-integer.mts'
import { advanceReplayRejectionFloor } from './cleanup-activitypub-replay-floor.mts'

// Keep PostgreSQL's microsecond timestamp text when reporting the last deleted row.
type Key = { at: string; id: string }
export type ReplayCleanupPage = {
  deleted: number
  hasMore: boolean
  continuationPosition: Key | null
}

/** Each capped ledger page and its floor advance commit before the next page begins. */
export async function cleanupActivityPubReplayLedger(options: {
  batchSize: number
  maxBatches: number
  now?: Date
}): Promise<ReplayCleanupPage> {
  return cleanupActivityPubReplayPages(options, beginTransaction)
}

/** The bounded page protocol owns each transaction; SQL callers supply the normal DB opener. */
export async function cleanupActivityPubReplayPages(
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
    page = await cleanupActivityPubReplayPage(query, { batchSize: options.batchSize, cutoff })
    await query.commit()
    deleted += page.deleted
    if (!page.hasMore) break
  }
  return { ...page, deleted }
}

/** One real SQL page, called inside the short production transaction. */
export async function cleanupActivityPubReplayPage(
  query: TransactionQuery,
  options: { batchSize: number; cutoff: Date },
): Promise<ReplayCleanupPage> {
  const ageBound = getMinUUIDv7ForDate(new Date(Math.max(0, options.cutoff.getTime())))
  await query(
    `/* ensureActivityPubReplayRejectionFloor */
     INSERT INTO activitypub_replay_rejection_floors DEFAULT VALUES
     ON CONFLICT (is_singleton) DO NOTHING`,
  )
  await query(
    `/* lockActivityPubReplayRejectionFloorForCleanup */
     SELECT is_singleton FROM activitypub_replay_rejection_floors FOR UPDATE`,
  )
  // The inbox UUIDv7 primary key supplies the oldest eligible rows.
  const { rows } = await query<Key>(
    `/* no-mistakes: deadlock-safe -- the floor row is locked first, then one ordered indexed ledger page; waiting preserves contiguous floor advancement. */
       /* listActivityPubReplayRetentionCandidates */
       SELECT received_at::text AS at, id FROM activitypub_inbox_activities
       WHERE id < $1::uuid
       ORDER BY id LIMIT $2 FOR UPDATE`,
    [ageBound, options.batchSize + 1],
  )
  const page = rows.slice(0, options.batchSize)
  if (page.length === 0) {
    return { deleted: 0, hasMore: false, continuationPosition: null }
  }
  const removed = await query<Key>(
    `/* deleteActivityPubReplayRetentionCandidates */
       DELETE FROM activitypub_inbox_activities WHERE id = ANY($1::uuid[]) AND id < $2::uuid
       RETURNING received_at::text AS at, id`,
    [page.map(item => item.id), ageBound],
  )
  // Admission holds a share lock on the same floor row. Deletion and floor advance commit together.
  await advanceReplayRejectionFloor(query, removed.rows)
  const hasMore = rows.length > options.batchSize
  return {
    deleted: removed.rowCount ?? 0,
    hasMore,
    continuationPosition: hasMore ? page.at(-1)! : null,
  }
}
