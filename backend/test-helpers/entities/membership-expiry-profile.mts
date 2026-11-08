import type { QueryExecutor } from '@data-stores/psql'
import { withPostgresTransactionForTest } from '../postgres-transaction.mts'
import { withCapturedTestQueries } from '../query-capture.mts'

export async function profileTestMembershipExpiry<T>(
  userId: string,
  expire: (query: QueryExecutor) => Promise<T>,
) {
  return withPostgresTransactionForTest(async query => {
    const captured = await withCapturedTestQueries(() => expire(query))
    return { ...captured, history: await readTestMembershipChangeEffects(userId, query) }
  })
}

export async function readTestMembershipChangeEffects(userId: string, query: QueryExecutor) {
  const { rows } = await query<{
    change_type: string
    membership_grant_id: string | null
    latest: boolean
    effects: number
  }>(
    `/* readTestMembershipChangeEffects */
     SELECT change.change_type, change.membership_grant_id,
       COALESCE(membership.latest_change_id = change.id, false) AS latest,
       (SELECT count(*)::int FROM membership_entitlement_effects effect
        WHERE effect.membership_change_id = change.id) AS effects
     FROM membership_changes change JOIN memberships membership ON membership.id = change.membership_id
     WHERE change.user_id = $1 ORDER BY change.created_at, change.id`,
    [userId],
  )
  return rows
}
