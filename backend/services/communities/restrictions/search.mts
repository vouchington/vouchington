import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { buildPageInfo, decodeScopedUuidCursor } from '@modules/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { CommunityRestriction } from '../types.mts'

export async function searchCommunityRestrictions(
  communityId: string,
  options?: QueryOptions & { limit?: number; after?: string; status?: 'active' | 'past' },
): Promise<{ results: CommunityRestriction[]; page_info: PageInfo }> {
  const limit = options?.limit ?? 20
  const status = options?.status ?? 'active'
  assert(Number.isInteger(limit), 422, 'limit must be an integer')
  assert(limit > 0 && limit <= 100, 422, 'limit must be between 1 and 100')
  assert(status === 'active' || status === 'past', 422, 'Invalid restriction status')
  const scope = `community-restrictions:v1:${communityId.toLowerCase()}:${status}:id-desc`
  const cursor = options?.after
    ? decodeScopedUuidCursor(options.after, scope, 'Invalid cursor format')
    : undefined
  const now = new Date()
  const query =
    status === 'active'
      ? sql`/* searchCommunityRestrictions */
        SELECT id, community_id, restriction_type, activated_by_id, activated_at, expires_at,
          created_at, updated_at, lifted_at, lifted_by_id, reason
        FROM community_restrictions
        WHERE community_id = ${communityId}
          AND lifted_at IS NULL AND (expires_at IS NULL OR expires_at > ${now})
      `
      : sql`/* searchCommunityRestrictions */
        SELECT restriction.id, restriction.community_id, restriction.restriction_type,
          restriction.activated_by_id, restriction.activated_at, restriction.expires_at,
          restriction.created_at, restriction.updated_at, restriction.lifted_at,
          restriction.lifted_by_id, restriction.reason
        FROM (
          SELECT community_id, id
          FROM community_restrictions
          WHERE community_id BETWEEN ${communityId} AND ${communityId}
            AND (lifted_at IS NOT NULL OR expires_at <= ${now})
      `
  if (cursor) query.append(sql` AND id < ${cursor.id}::uuid`)
  if (status === 'active') {
    query.append(sql` ORDER BY id DESC LIMIT ${limit + 1}`)
  } else {
    query.append(sql`
          ORDER BY community_id ASC, id DESC
          LIMIT ${limit + 1}
        ) AS page
        JOIN community_restrictions AS restriction ON restriction.id = page.id
        ORDER BY page.community_id ASC, page.id DESC
    `)
  }
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
