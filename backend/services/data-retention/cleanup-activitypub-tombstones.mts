import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import { getTerminalActivityIdentityRetentionDays } from '@services/ap-inbox-activities/config'
import { runBoundedBatches } from './run-bounded-batches.mts'

const SOURCES = {
  follow: { table: 'activitypub_remote_follow_activities', timestamp: 'undone_at' },
  like: { table: 'activitypub_post_like_activities', timestamp: 'undone_at' },
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
  // Cap the physical terminal-identity page before checking or deleting related payload rows.
  const { rows } = await query<{ id: string }>(
    `/* cleanupActivityPubTerminalIdentityPage */
     SELECT id FROM ${source.table}
     WHERE ${source.timestamp} < $1::timestamptz
     ORDER BY ${source.timestamp}, id LIMIT $2 FOR UPDATE SKIP LOCKED`,
    [cutoff, batchSize],
  )
  if (rows.length === 0) return 0
  const ids = rows.map(row => row.id)
  // A Like payload RESTRICTs its identity. Delete terminal owned children first, in this same
  // transaction, without joining protection predicates into the uncapped candidate scan.
  if (kind === 'like') {
    await query(
      `/* deleteTerminalActivityLikePayloadPage */
       DELETE FROM activitypub_post_likes WHERE id = ANY($1::uuid[]) AND deleted_at IS NOT NULL`,
      [ids],
    )
  }
  const childGuard =
    kind === 'like'
      ? 'AND NOT EXISTS (SELECT 1 FROM activitypub_post_likes child WHERE child.id = target.id)'
      : ''
  const { rowCount } = await query(
    `/* deleteTerminalActivityIdentityPage */
     DELETE FROM ${source.table} target
     WHERE target.id = ANY($1::uuid[]) AND target.${source.timestamp} < $2::timestamptz
       ${childGuard}`,
    [ids, cutoff],
  )
  return rowCount ?? 0
}
