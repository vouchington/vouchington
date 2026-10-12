import { read } from '../fixture-executor.mts'
import sql from '../fixture-sql.mts'

export async function countUserDeletionRequestsForTest(userId: string): Promise<number> {
  const { rows } = await read(sql`
    SELECT COUNT(*)::int AS count
    FROM user_deletion_requests
    WHERE user_id = ${userId}
  `)
  return (rows[0] as { count?: number } | undefined)?.count ?? 0
}
