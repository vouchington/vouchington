import assert from 'http-assert'
import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { enqueueRecalculateUserVoteWeightBestEffort } from '@queues/vote-aggregation/enqueues/vote-weight'
import { markJwtStale } from '@data-stores/valkey/jwt-stale'
import onError from '@modules/on-error'
import { getUserMfaStatus } from '@services/mfa/status'
import { conflictOnSerializationFailure } from '@modules/utils/serialization-conflict'

export const addUserRole = async (userId: string, role: string) => {
  await conflictOnSerializationFailure(() => grantUserRole(userId, role))
  await Promise.all([
    enqueueRecalculateUserVoteWeightBestEffort(userId),
    markJwtStale(userId).catch(onError),
  ])
}

async function grantUserRole(userId: string, role: string) {
  // Only the administrator grant reads MFA state that factor removal can invalidate.
  await using query = await beginTransaction({ serializable: role === 'administrator' })
  const { rows } = await query<{
    deleted_at: Date | null
    platform_account_kind: 'official' | 'system' | null
  }>(sql`/* readRoleGrantUser */
    SELECT deleted_at, platform_account_kind FROM users WHERE id = ${userId}::uuid
  `)
  const user = rows[0]
  assert(user?.deleted_at === null, 404, 'User not found')
  assert(user.platform_account_kind !== 'system', 403, 'System accounts cannot hold roles')
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
    WHERE EXISTS (SELECT 1 FROM users WHERE id = input.user_id AND deleted_at IS NULL)
    ORDER BY input.user_id ASC NULLS LAST, input.role_type_id ASC NULLS LAST
    ON CONFLICT (user_id, role_type_id) DO NOTHING
  `)
  if (rowCount)
    await query(sql`/* addUserRole: mark vote weight dirty */
      UPDATE users SET vote_weight_recalculated_at = NULL
      WHERE id = ${userId}::uuid AND deleted_at IS NULL`)
  await query.commit()
}
