import type { TransactionQuery } from '@data-stores/psql'

/** Share-lock the ledger's permanent floor before an identity claim; cleanup takes FOR UPDATE. */
export async function lockActivityPubReplayFloor(
  query: TransactionQuery,
  kind: 'inbox' | 'outbound',
): Promise<Date | null> {
  const isOutbound = kind === 'outbound'
  await query(
    `/* ensureActivityPubReplayRejectionFloor */
     INSERT INTO activitypub_replay_rejection_floors (is_outbound) VALUES ($1)
     ON CONFLICT (is_outbound) DO NOTHING`,
    [isOutbound],
  )
  const { rows } = await query<{ rejection_floor_at: Date | null }>(
    `/* lockActivityPubReplayFloor */
     SELECT rejection_floor_at FROM activitypub_replay_rejection_floors
     WHERE is_outbound = $1 FOR SHARE`,
    [isOutbound],
  )
  if (!rows[0]) throw new Error('Missing ActivityPub replay rejection floor')
  return rows[0].rejection_floor_at
}
