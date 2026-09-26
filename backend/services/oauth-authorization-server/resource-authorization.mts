import { write, type QueryExecutor } from '@data-stores/psql'
import { findOAuthProtectedResource } from './resources.mts'

// Only administrators may grant a client access to the admin MCP resource. The admin MCP route
// still checks the role on every call; this keeps a non-admin from approving an unusable grant.
export async function mayUserAuthorizeOAuthResource(
  userId: string,
  resource: string,
  query: QueryExecutor = write,
): Promise<boolean> {
  const audience = findOAuthProtectedResource(resource)?.audience
  if (audience === 'user') return true
  if (audience !== 'admin') return false
  const result = await query<{ is_administrator: boolean }>(
    `/* mayUserAuthorizeOAuthResource */ SELECT EXISTS (
       SELECT 1
       FROM user_roles
       JOIN user_roles_types ON user_roles_types.id = user_roles.role_type_id
       WHERE user_roles.user_id = $1::uuid
         AND user_roles_types.slug = 'administrator'
     ) AS is_administrator`,
    [userId],
  )
  return result.rows[0]?.is_administrator === true
}
