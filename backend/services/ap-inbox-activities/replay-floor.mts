import { beginTransaction, type TransactionQuery } from '@data-stores/psql'

/** Share-lock the ledger's permanent floor before an identity claim; cleanup takes FOR UPDATE. */
export async function lockActivityPubReplayFloor(
  query: TransactionQuery,
  kind: 'inbox' | 'outbound',
): Promise<Date | null> {
  const isOutbound = kind === 'outbound'
  await query(
    `/* ensureActivityPubReplayRetentionCursor */
     INSERT INTO activitypub_replay_retention_cursors (is_outbound) VALUES ($1)
     ON CONFLICT (is_outbound) DO NOTHING`,
    [isOutbound],
  )
  const { rows } = await query<{ rejection_floor_at: Date | null }>(
    `/* lockActivityPubReplayFloor */
     SELECT rejection_floor_at FROM activitypub_replay_retention_cursors
     WHERE is_outbound = $1 FOR SHARE`,
    [isOutbound],
  )
  if (!rows[0]) throw new Error('Missing ActivityPub replay-retention cursor')
  return rows[0].rejection_floor_at
}

/** Serialize admission with cleanup, then release the lock before outbound network delivery. */
export async function readOutboundReplayFloor(): Promise<Date | null> {
  await using query = await beginTransaction()
  const floor = await lockActivityPubReplayFloor(query, 'outbound')
  await query.commit()
  return floor
}
