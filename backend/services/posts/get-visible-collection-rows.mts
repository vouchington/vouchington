import { assertWhitelistedSqlIdentifier, read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import type { PrivateUser } from '@services/users/types'
import { isModerationStaff } from '@services/users/authorization'
import {
  POST_LIST_TABLES,
  type PostRelationTableName,
} from '@services/users/profile-collection-tables'
import sql from 'sql-template-strings'
import { BLOCKED_POST_TYPES } from './blocked-post-types.mts'
import { buildDirectPostAccessFilter } from './direct-access-filter.mts'
import {
  appendPrivatePostCollectionCursorBoundary,
  appendPrivatePostCollectionOrder,
  type PrivatePostCollectionCursor,
} from './private-collection-pagination.mts'

export type VisiblePostCollectionRow = { entity_id: string; created_us: number }

const POST_RELATION_TABLE_NAMES: ReadonlySet<PostRelationTableName> = new Set(
  Object.values(POST_LIST_TABLES),
)

export function assertPostRelationTableName(tableName: string): PostRelationTableName {
  return assertWhitelistedSqlIdentifier(
    tableName,
    POST_RELATION_TABLE_NAMES,
    'postRelationTableName',
  ) as PostRelationTableName
}

export async function getVisiblePostCollectionRows(
  currentUser: PrivateUser | null,
  tableName: PostRelationTableName,
  userId: string,
  limit: number,
  filters: { after?: PrivatePostCollectionCursor } = {},
  options: QueryOptions = {},
): Promise<VisiblePostCollectionRow[]> {
  const validatedTableName = assertPostRelationTableName(tableName)
  const query = sql`/* getVisiblePostCollectionRows */
    SELECT relation.object_id AS entity_id,
           (EXTRACT(EPOCH FROM relation.created_at) * 1000000)::bigint AS created_us
    FROM `
    .append(validatedTableName)
    .append(sql` relation
    JOIN posts candidate_post ON candidate_post.id = relation.object_id
    JOIN posts access_post
      ON access_post.id = COALESCE(candidate_post.root_id, candidate_post.id)
    WHERE relation.subject_id = ${userId}
      AND relation.deleted_at IS NULL
      AND candidate_post.post_type::text != ALL(${[...BLOCKED_POST_TYPES]}::text[])
      AND access_post.post_type::text != ALL(${[...BLOCKED_POST_TYPES]}::text[])
      AND `)
    .append(buildDirectPostAccessFilter(currentUser?.id ?? null, isModerationStaff(currentUser)))

  if (filters.after) {
    appendPrivatePostCollectionCursorBoundary(query, filters.after)
  }
  appendPrivatePostCollectionOrder(query).append(sql`
    LIMIT ${limit}`)

  const { rows } = await read<{ entity_id: string; created_us: string }>(query, options)
  return rows.map(row => ({ entity_id: row.entity_id, created_us: Number(row.created_us) }))
}
