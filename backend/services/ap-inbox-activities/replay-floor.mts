import type { TransactionQuery } from '@data-stores/psql'

/** Cleanup only advances the floor; this snapshot needs no singleton lifecycle fence. */
export async function readActivityPubReplayFloor(query: TransactionQuery): Promise<Date | null> {
  const { rows } = await query<{ rejection_floor_at: Date | null }>(
    `/* readActivityPubReplayFloor */
     SELECT rejection_floor_at FROM activitypub_replay_rejection_floors LIMIT 1`,
  )
  return rows[0]?.rejection_floor_at ?? null
}
