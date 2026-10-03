import assert from 'http-assert'
import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { enqueueRecalculateUserVoteWeight } from '@queues/vote-weight/enqueues'
import { markJwtStale } from '@data-stores/valkey/jwt-stale'
import onError from '@modules/on-error'

export const addUserRole = async (userId: string, role: string) => {
  await using query = await beginTransaction()
  const { rows } = await query<{
    platform_account_kind: 'official' | 'system' | null
  }>(sql`/* lockRoleGrantUser */
    SELECT platform_account_kind FROM users WHERE id = ${userId}::uuid FOR UPDATE
  `)
  assert(rows[0]?.platform_account_kind !== 'system', 403, 'System accounts cannot hold roles')
  await query(sql`/* addUserRole */
    WITH user_role AS (
      SELECT id FROM user_roles_types WHERE slug = ${role}
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
  await query.commit()
  void enqueueRecalculateUserVoteWeight(userId)
  markJwtStale(userId).catch(onError)
}
