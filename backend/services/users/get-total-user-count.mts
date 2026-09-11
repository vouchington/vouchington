import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

// Total active (non-deleted, non-system) user count. Used by the ActivityPub NodeInfo endpoint's
// usage.users.total field — a coarse, publicly-disclosed metric, not a precise audience size.
export async function getTotalUserCount(): Promise<number> {
  const { rows } = await read<{ count: number }>(sql`/* getTotalUserCount */
    SELECT COUNT(*)::INTEGER AS count
    FROM users
    WHERE deleted_at IS NULL
      AND is_system = FALSE
  `)
  return rows[0]?.count ?? 0
}
