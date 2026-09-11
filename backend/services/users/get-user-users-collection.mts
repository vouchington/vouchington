import type { QueryOptions } from '@data-stores/psql/types'
import { buildPageInfo, decodeScopedTimestampUuidCursor } from '@modules/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import { getPublicUsersByAnyBatch } from './get-public-batch.mts'
import { compactResults } from './profile-collection-ids.mts'
import { USER_LIST_TABLES, type UserListType } from './profile-collection-tables.mts'
import {
  getRelationObjectRows,
  getRelationSubjectRows,
} from './profile-collection-relation-rows.mts'
import type { PublicUser } from './types.mts'

const DEFAULT_LIMIT = 100

export async function getUserUsersCollection(
  userId: string,
  listType: UserListType,
  paginationOptions: { limit?: number; after?: string; query?: string } = {},
  options: QueryOptions = {},
): Promise<{ results: PublicUser[]; page_info: PageInfo }> {
  const { limit = DEFAULT_LIMIT, after, query } = paginationOptions
  const scope = `user:${userId}:users:${listType}:${query ?? ''}`
  const afterCursor = after
    ? decodeScopedTimestampUuidCursor(after, scope, `Invalid ${listType}-user cursor`)
    : undefined

  const relationRows =
    listType === 'followers'
      ? await getRelationSubjectRows(USER_LIST_TABLES[listType], userId, limit + 1, options, {
          after: afterCursor,
          query,
        })
      : await getRelationObjectRows(USER_LIST_TABLES[listType], userId, limit + 1, options, {
          after: afterCursor,
          query,
        })

  const hasNextPage = relationRows.length > limit
  const pageRows = relationRows.slice(0, limit)
  const page_info = buildPageInfo(pageRows, {
    hasNextPage,
    getCursor: row => ({ timestamp: row.created_us, id: row.entity_id, scope }),
  })

  if (pageRows.length === 0) return { results: [], page_info }

  const users = await getPublicUsersByAnyBatch(
    pageRows.map(row => row.entity_id),
    options,
  )
  return { results: compactResults(users), page_info }
}
