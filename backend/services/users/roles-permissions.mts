import assert from 'http-assert'
import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { enqueueRecalculateUserVoteWeightBestEffort } from '@queues/vote-aggregation/enqueues/vote-weight'
import { markJwtStale } from '@data-stores/valkey/jwt-stale'
import onError from '@modules/on-error'
import { getUserMfaStatus } from '@services/mfa/status'

export const addUserRole = async (userId: string, role: string) => {
  await using query = await beginTransaction()
  await query(sql`/* lockRoleGrantUser */ SELECT fn_lock_active_user_for_mutation(${userId})`)
  const { rows } = await query<{
    platform_account_kind: 'official' | 'system' | null
  }>(sql`/* lockRoleGrantUser */
    SELECT platform_account_kind FROM users WHERE id = ${userId}::uuid FOR UPDATE
  `)
  assert(rows[0]?.platform_account_kind !== 'system', 403, 'System accounts cannot hold roles')
  if (role === 'administrator') {
    const status = await getUserMfaStatus(userId, { query })
    assert(status.hasMfa, 403, 'Administrator role requires MFA')
  }
  const { rowCount } = await query(sql`/* addUserRole */
    WITH user_role AS (
      SELECT id FROM user_role_types WHERE slug = ${role}
    )

    INSERT INTO user_roles (user_id, role_type_id)
    SELECT input.user_id, input.role_type_id
    FROM (
      SELECT ${userId}::uuid AS user_id, id AS role_type_id
      FROM user_role
    ) AS input
    ORDER BY input.user_id ASC NULLS LAST, input.role_type_id ASC NULLS LAST
    ON CONFLICT (user_id, role_type_id) DO NOTHING
  `)
  if (rowCount)
    await query(sql`/* addUserRole: mark vote weight dirty */
      UPDATE users SET vote_weight_recalculated_at = NULL WHERE id = ${userId}::uuid`)
  await query.commit()
  await Promise.all([
    enqueueRecalculateUserVoteWeightBestEffort(userId),
    markJwtStale(userId).catch(onError),
  ])
}
