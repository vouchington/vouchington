import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { buildPageInfo, decodeScopedUuidCursor } from '@modules/pagination'
import { validateUUID } from '@modules/utils'
import type { PageInfo } from '@voucha/types/pagination'
import sql from 'sql-template-strings'
import type { CommunityMember } from '../types.mts'

export async function getMyCommunityMemberships(
  userId: string,
  paginationOptions: { limit?: number; after?: string } = {},
  options: QueryOptions = {},
): Promise<{ results: CommunityMember[]; page_info: PageInfo }> {
  validateUUID(userId)
  const { limit = 100, after } = paginationOptions
  const scope = `my-communities:${userId}`
  const cursorId = after
    ? decodeScopedUuidCursor(after, scope, 'Invalid my-communities cursor').id
    : undefined

  // community_members.created_at is a generated column derived from the id's uuidv7
  // timestamp bits, so ordering by id is equivalent to ordering by created_at and lets this
  // query use the (user_id, id) index instead of an unindexed timestamp comparison.
  const query = sql`/* getMyCommunityMemberships */
    SELECT id, community_id, user_id, role, approved_by_id, created_at, updated_at, removed_at, removed_by_id
    FROM community_members
    WHERE user_id = ${userId}
      AND removed_at IS NULL`
  if (cursorId) query.append(sql` AND id > ${cursorId}`)
  query.append(sql` ORDER BY id ASC LIMIT ${limit + 1}`)

  const { rows } = await read<CommunityMember>(query, options)
  const hasNextPage = rows.length > limit
  const results = rows.slice(0, limit)
  const page_info = buildPageInfo(results, {
    hasNextPage,
    getCursor: row => ({ id: row.id, scope }),
  })
  return { results, page_info }
}
