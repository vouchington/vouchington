import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { createTestUserDirect, addTestUserRole } from './entities/users-direct.mts'

type PlatformKind = 'official' | 'system' | null

export async function createAccountTypeTestUser(kind: PlatformKind, role?: string) {
  const user = await createTestUserDirect()
  await setAccountTypeTestUserKind(user.id, kind)
  if (role) await addTestUserRole(user.id, role)
  return user
}

export async function setAccountTypeTestUserKind(id: string, kind: PlatformKind) {
  await write(sql`/* setAccountTypeTestUserKind */
    UPDATE users SET platform_account_kind = ${kind} WHERE id = ${id}::uuid
  `)
}

export async function createAccountTypeTestAgent(userId: string, deleted = false, active = false) {
  const { rows } = await write<{ id: string }>(sql`/* createAccountTypeTestAgent */
    INSERT INTO agents (system_user_id, agent_type, activated_at, deactivated_at, deleted_at)
    VALUES (${userId}::uuid, 'classifier', ${active ? new Date() : null}, ${active ? null : new Date()}, ${deleted ? new Date() : null})
    RETURNING id
  `)
  return rows[0]!.id
}

export async function getInvalidPlatformAccountCounts() {
  const { rows } = await read<{ system_roles: number; non_system_agents: number }>(sql`
    /* getInvalidPlatformAccountCounts */
    SELECT
      (SELECT COUNT(*)::integer FROM user_roles r JOIN users u ON u.id = r.user_id
        WHERE u.platform_account_kind = 'system') AS system_roles,
      (SELECT COUNT(*)::integer FROM agents a JOIN users u ON u.id = a.system_user_id
        WHERE u.platform_account_kind IS DISTINCT FROM 'system') AS non_system_agents
  `)
  return rows[0]!
}

export async function getSeededAccountKinds() {
  const { rows } = await read<{
    username: string
    platform_account_kind: PlatformKind
    agent_type: string | null
  }>(sql`
    /* getSeededAccountKinds */
    SELECT u.username, u.platform_account_kind, a.agent_type
    FROM users u LEFT JOIN agents a ON a.system_user_id = u.id AND a.deleted_at IS NULL
    WHERE u.username IN ('jong', 'voucha', 'deleted', 'post-classifier', 'autotagger-classifier',
      'story-clustering-classifier', 'rss-feed-categorizer', 'rss-feed-collaborative-categorizer', 'automod')
  `)
  return rows
}
