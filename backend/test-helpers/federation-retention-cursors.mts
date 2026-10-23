import type { TransactionQuery } from '@data-stores/psql'

const SEED_CURSOR = 'ffffffff-ffff-7fff-ffff-ffffffffffff'

/** Resets only the singleton row under lock in a caller-owned rollback transaction. */
export async function resetFollowerDistributionRetentionCursorForTest(
  query: TransactionQuery,
  now: Date,
): Promise<string | null> {
  await query(
    `/* ensureFollowerDistributionRetentionCursorForTest */
     INSERT INTO follower_distribution_retention_cursors (is_singleton) VALUES (TRUE)
     ON CONFLICT (is_singleton) DO NOTHING`,
  )
  await query(
    `/* lockFollowerDistributionRetentionCursorForTest */
     SELECT is_singleton FROM follower_distribution_retention_cursors WHERE is_singleton FOR UPDATE`,
  )
  await query(
    `/* seedFollowerDistributionRetentionCursorForTest */
     UPDATE follower_distribution_retention_cursors
     SET sweep_cutoff_at = $1, cursor_distribution_position = $2::uuid, sweep_upper_bound_distribution_position = $2::uuid
     WHERE is_singleton`,
    [now, SEED_CURSOR],
  )
  const { rows } = await query<{ cursor_distribution_position: string | null }>(
    `/* readFollowerDistributionRetentionCursorForTest */
     SELECT cursor_distribution_position FROM follower_distribution_retention_cursors WHERE is_singleton`,
  )
  await query(
    `/* resetFollowerDistributionRetentionCursorForTest */
     UPDATE follower_distribution_retention_cursors
     SET sweep_cutoff_at = NULL, cursor_distribution_position = NULL, sweep_upper_bound_distribution_position = NULL
     WHERE is_singleton`,
  )
  return rows[0]?.cursor_distribution_position ?? null
}

export async function readFollowerDistributionRetentionCursorForTest(query: TransactionQuery) {
  const { rows } = await query<{
    sweep_cutoff_at: Date | null
    cursor_distribution_position: string | null
    sweep_upper_bound_distribution_position: string | null
  }>(
    `/* readFollowerDistributionRetentionCursorStateForTest */
     SELECT sweep_cutoff_at, cursor_distribution_position, sweep_upper_bound_distribution_position
     FROM follower_distribution_retention_cursors WHERE is_singleton`,
  )
  return rows[0]
}
