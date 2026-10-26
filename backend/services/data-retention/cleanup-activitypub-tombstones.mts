import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import { getTerminalActivityIdentityRetentionDays } from '@services/ap-inbox-activities/config'
import { runBoundedBatches } from './run-bounded-batches.mts'

const SOURCES = {
  follow: { table: 'activitypub_remote_follow_activities', timestamp: 'undone_at' },
  like: { table: 'activitypub_post_likes', timestamp: 'deleted_at' },
} as const

/** Active cycles remain domain facts; each terminal page expires beyond the replay horizon. */
export async function cleanupActivityPubTerminalIdentities(
  kind: keyof typeof SOURCES,
  options: { batchSize: number; maxBatches: number; now?: Date },
): Promise<{ deleted: number; hasMore: boolean }> {
  return cleanupActivityPubTerminalIdentityPages(kind, options, beginTransaction)
}

/** Each caller supplies a real transaction opener; family mapping and bounded SQL stay here. */
export async function cleanupActivityPubTerminalIdentityPages(
  kind: keyof typeof SOURCES,
  options: { batchSize: number; maxBatches: number; now?: Date },
  openTransaction: typeof beginTransaction,
): Promise<{ deleted: number; hasMore: boolean }> {
  const cutoff = new Date(
    (options.now ?? new Date()).getTime() - getTerminalActivityIdentityRetentionDays() * 86_400_000,
  )
  return runBoundedBatches(options, async batchSize => {
    await using query = await openTransaction()
    const deleted = await cleanupActivityPubTerminalIdentityPage(query, kind, cutoff, batchSize)
    await query.commit()
    return deleted
  })
}

export async function cleanupActivityPubTerminalIdentityPage(
  query: TransactionQuery,
  kind: keyof typeof SOURCES,
  cutoff: Date,
  batchSize: number,
): Promise<number> {
  const source = SOURCES[kind]
  const { rowCount } = await query(
    `/* cleanupActivityPubTerminalIdentityPage */
     WITH page AS MATERIALIZED (
       SELECT id FROM ${source.table}
       WHERE ${source.timestamp} < $1::timestamptz
       ORDER BY ${source.timestamp}, id LIMIT $2 FOR UPDATE SKIP LOCKED
     )
     DELETE FROM ${source.table} target USING page
     WHERE target.id = page.id AND target.${source.timestamp} < $1::timestamptz`,
    [cutoff, batchSize],
  )
  return rowCount ?? 0
}
