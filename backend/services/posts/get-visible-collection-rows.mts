import { assertWhitelistedSqlIdentifier, read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { sliceRawKeysetPage } from '@modules/pagination'
import type { PrivateUser } from '@services/users/types'
import { isModerationStaff } from '@services/users/authorization'
import { BLOCKED_POST_TYPES } from '@voucha/types/entities/post'
import {
  POST_LIST_TABLES,
  type PostRelationTableName,
} from '@services/users/profile-collection-tables'
import sql from 'sql-template-strings'
import { buildDirectPostAccessFilter } from './direct-access-filter.mts'
import {
  appendPrivatePostCollectionCursorBoundary,
  appendPrivatePostCollectionOrder,
  type PrivatePostCollectionCursor,
} from './private-collection-pagination.mts'

type VisiblePostCollectionRow = { entity_id: string; created_us: number }

export type VisiblePostCollectionPage = {
  /** Eligible rows inside the raw membership window, in keyset order. */
  rows: VisiblePostCollectionRow[]
  /** Live membership keys inspected, including ineligible targets. */
  inspected: VisiblePostCollectionRow[]
  hasMore: boolean
}

const POST_RELATION_TABLE_NAMES: ReadonlySet<PostRelationTableName> = new Set(
  Object.values(POST_LIST_TABLES),
)

function assertPostRelationTableName(tableName: string): PostRelationTableName {
  return assertWhitelistedSqlIdentifier(
    tableName,
    POST_RELATION_TABLE_NAMES,
    'postRelationTableName',
  ) as PostRelationTableName
}

/**
 * Pages live membership rows first. `limit` is the page size; the statement reads one extra
 * membership key as the has-more probe. Target visibility is applied to that page, so `rows`
 * can be shorter than `limit`.
 */
export async function getVisiblePostCollectionRows(
  currentUser: PrivateUser | null,
  tableName: PostRelationTableName,
  userId: string,
  limit: number,
  filters: { after?: PrivatePostCollectionCursor } = {},
  options: QueryOptions = {},
): Promise<VisiblePostCollectionPage> {
  const validatedTableName = assertPostRelationTableName(tableName)
  const rawLimit = limit + 1
  const query = sql`/* getVisiblePostCollectionRows */
    WITH driving_page AS MATERIALIZED (
      SELECT relation.object_id AS entity_id,
             (EXTRACT(EPOCH FROM relation.created_at) * 1000000)::bigint AS created_us
      FROM `.append(validatedTableName).append(sql` relation
      WHERE relation.subject_id = ${userId}
        AND relation.deleted_at IS NULL`)

  if (filters.after) appendPrivatePostCollectionCursorBoundary(query, filters.after)
  appendPrivatePostCollectionOrder(query).append(sql`
      LIMIT ${rawLimit}
    )
    SELECT driving.entity_id,
           driving.created_us,
           COALESCE((
             candidate_post.id IS NOT NULL
             AND access_post.id IS NOT NULL
             AND candidate_post.post_type::text != ALL(${[...BLOCKED_POST_TYPES]}::text[])
             AND access_post.post_type::text != ALL(${[...BLOCKED_POST_TYPES]}::text[])
             AND `)
  query.append(buildDirectPostAccessFilter(currentUser?.id ?? null, isModerationStaff(currentUser)))
  // `hide` on a comment only collapses it in its thread, so the hidden list never shows one.
  if (validatedTableName === POST_LIST_TABLES.hidden) {
    query.append(sql` AND candidate_post.post_type <> 'comment'`)
  }
  query.append(sql`
           ), FALSE) AS eligible
    FROM driving_page driving
    LEFT JOIN LATERAL (
      SELECT id, root_post_id, post_type, deleted_at, approved_at, created_by_id,
             community_id, privacy, broadcast
      FROM posts candidate_post
      WHERE candidate_post.id = driving.entity_id
      LIMIT 1
    ) candidate_post ON TRUE
    LEFT JOIN LATERAL (
      SELECT id, post_type, deleted_at, approved_at, created_by_id, community_id, privacy, broadcast
      FROM posts access_post
      WHERE access_post.id = COALESCE(candidate_post.root_post_id, candidate_post.id)
      LIMIT 1
    ) access_post ON TRUE
    ORDER BY driving.created_us DESC, driving.entity_id DESC`)

  const { rows } = await read<{
    entity_id: string
    created_us: string
    eligible: boolean
  }>(query, options)
  const fetched = rows.map(row => ({
    entity_id: row.entity_id,
    created_us: Number(row.created_us),
    eligible: row.eligible,
  }))
  const { window, hasMore } = sliceRawKeysetPage(fetched, limit)
  const visibleRows: VisiblePostCollectionRow[] = []
  for (const row of window) if (row.eligible) visibleRows.push(toVisibleRow(row))
  return {
    rows: visibleRows,
    inspected: window.map(toVisibleRow),
    hasMore,
  }
}

function toVisibleRow(row: VisiblePostCollectionRow): VisiblePostCollectionRow {
  return { entity_id: row.entity_id, created_us: row.created_us }
}
