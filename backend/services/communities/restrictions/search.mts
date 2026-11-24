import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { buildPageInfo, decodeScopedUuidCursor } from '@modules/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import createHttpError from 'http-errors'
import type { CommunityRestriction } from '../types.mts'

export async function searchCommunityRestrictions(
  communityId: string,
  options?: QueryOptions & { limit?: number; after?: string; status?: 'active' | 'past' },
): Promise<{ results: CommunityRestriction[]; page_info: PageInfo }> {
  const limit = options?.limit ?? 20
  const status = options?.status ?? 'active'
  assert(Number.isInteger(limit), 422, 'limit must be an integer')
  assert(limit > 0 && limit <= 100, 422, 'limit must be between 1 and 100')
  const scope = `community-restrictions:v1:${communityId.toLowerCase()}:${status}:id-desc`
  const query = buildRestrictionSearchQuery(communityId, status, {
    after: options?.after,
    scope,
    pageSize: limit + 1,
  })
  const { rows } = await read<CommunityRestriction>(query, options)
  const results = rows.slice(0, limit)
  return {
    results,
    page_info: buildPageInfo(results, {
      hasNextPage: rows.length > limit,
      getCursor: row => ({ id: row.id, scope }),
    }),
  }
}

function buildRestrictionSearchQuery(
  communityId: string,
  status: 'active' | 'past',
  { after, scope, pageSize }: { after: string | undefined; scope: string; pageSize: number },
) {
  const now = new Date()
  const query = sql`/* searchCommunityRestrictions */
    SELECT id, community_id, restriction_type, activated_by_id, activated_at, expires_at,
      created_at, updated_at, lifted_at, lifted_by_id, reason
    FROM community_restrictions
  `
  switch (status) {
    case 'active':
      return query
        .append(sql` WHERE community_id = ${communityId}
          AND lifted_at IS NULL AND (expires_at IS NULL OR expires_at > ${now})`)
        .append(restrictionCursorPredicate(after, scope))
        .append(sql` ORDER BY id DESC LIMIT ${pageSize}`)
    case 'past':
      // Equal bounds keep the community key in the index order. The scalar limit prevents
      // custom plans from pricing the page as a read of nearly all matching rows.
      return query
        .append(sql` WHERE community_id BETWEEN ${communityId} AND ${communityId}
          AND (lifted_at IS NOT NULL OR expires_at <= ${now})`)
        .append(restrictionCursorPredicate(after, scope))
        .append(sql` ORDER BY community_id ASC, id DESC LIMIT (SELECT ${pageSize}::int)`)
    default:
      throw createHttpError(422, 'Invalid restriction status')
  }
}

function restrictionCursorPredicate(after: string | undefined, scope: string) {
  if (!after) return ''
  const cursor = decodeScopedUuidCursor(after, scope, 'Invalid cursor format')
  return sql` AND id < ${cursor.id}::uuid`
}
