import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

type EntityWithCreatorId = { created_by_id?: string | null } | null | undefined
type EntityWithCreator =
  | {
      created_by?: { id: string } | null
    }
  | null
  | undefined
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Extracts the set of admin user IDs from entities that have a `created_by_id`.
 * Uses the cached user lookup — no additional DB queries when users are already cached.
 */
export async function getAdminUserIdsFromPosts(posts: EntityWithCreatorId[]): Promise<Set<string>> {
  const creatorIds = [
    ...new Set(
      posts.flatMap(p =>
        p != null && typeof p.created_by_id === 'string' && p.created_by_id.length > 0
          ? [p.created_by_id]
          : [],
      ),
    ),
  ]

  if (creatorIds.length === 0) return new Set()

  return getAdminUserIdsByIds(creatorIds)
}

/**
 * Extracts the set of admin user IDs from entities that have an embedded `created_by` user.
 * Uses direct role lookup so public embedded user payloads do not need to expose roles.
 */
export async function getAdminUserIdsFromEntities(
  entities: EntityWithCreator[],
): Promise<Set<string>> {
  const creatorIds = [
    ...new Set(
      entities.flatMap(entity =>
        entity?.created_by?.id && entity.created_by.id.length > 0 ? [entity.created_by.id] : [],
      ),
    ),
  ]
  return getAdminUserIdsByIds(creatorIds)
}

async function getAdminUserIdsByIds(userIds: string[]): Promise<Set<string>> {
  const validUserIds = userIds.filter(id => uuidPattern.test(id))
  if (validUserIds.length === 0) return new Set()
  const { rows } = await read<{ user_id: string }>(sql`/* getAdminUserIdsByIds */
    SELECT user_roles.user_id
    FROM user_roles
    JOIN users ON users.id = user_roles.user_id
    JOIN user_roles_types ON user_roles_types.id = user_roles.role_type_id
    WHERE user_roles.user_id = ANY(${validUserIds}::uuid[])
      AND users.deleted_at IS NULL
      AND user_roles_types.slug = 'administrator'
  `)
  return new Set(rows.map(row => row.user_id))
}
