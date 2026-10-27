import type { TransactionQuery } from '@data-stores/psql'

/** Share-lock the ledger's permanent floor before an identity claim; cleanup takes FOR UPDATE. */
export async function lockActivityPubReplayFloor(query: TransactionQuery): Promise<Date | null> {
  await query(
    `/* ensureActivityPubReplayRejectionFloor */
     INSERT INTO activitypub_replay_rejection_floors DEFAULT VALUES
     ON CONFLICT (is_singleton) DO NOTHING`,
  )
  const { rows } = await query<{ rejection_floor_at: Date | null }>(
    `/* lockActivityPubReplayFloor */
     SELECT rejection_floor_at FROM activitypub_replay_rejection_floors FOR SHARE`,
  )
  if (!rows[0]) throw new Error('Missing ActivityPub replay rejection floor')
  return rows[0].rejection_floor_at
}
