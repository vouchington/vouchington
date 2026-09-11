import { read } from '@data-stores/psql'
import { buildPageInfo, decodeScopedTierCursor } from '@modules/pagination'
import { validateUUID } from '@modules/utils'
import sql from 'sql-template-strings'
import type { LandingPage } from './types.mts'

const DEFAULT_LIMIT = 25
const MAX_LIMIT = 100

export interface LandingPagesPage {
  results: LandingPage[]
  page_info: {
    has_next_page: boolean
    start_cursor: string | null
    end_cursor: string | null
  }
}

export async function listLandingPagesForUser(userId: string): Promise<LandingPage[]> {
  validateUUID(userId)
  const { rows } = await read(sql`/* listLandingPagesForUser */
    SELECT id, user_id, title, subtitle, slug, is_default, created_at, updated_at
    FROM user_landing_pages
    WHERE user_id = ${userId}
    ORDER BY is_default DESC, id ASC
  `)
  return rows as LandingPage[]
}

export async function listLandingPagesForUserPage(
  userId: string,
  options: { limit?: number; after?: string | null } = {},
): Promise<LandingPagesPage> {
  validateUUID(userId)
  const limit = Math.floor(Math.max(1, Math.min(options.limit ?? DEFAULT_LIMIT, MAX_LIMIT)))
  const scope = getLandingPagesForUserCursorScope(userId)
  const cursor = options.after
    ? decodeScopedTierCursor(options.after, scope, 'Invalid cursor format')
    : null

  const query = sql`/* listLandingPagesForUserPage */
    SELECT id, user_id, title, subtitle, slug, is_default, created_at, updated_at
    FROM user_landing_pages
    WHERE user_id = ${userId}
  `

  if (cursor) {
    query.append(sql`
      AND (
        CASE WHEN is_default THEN 1 ELSE 0 END < ${cursor.tier}
        OR (CASE WHEN is_default THEN 1 ELSE 0 END = ${cursor.tier} AND id > ${cursor.id}::uuid)
      )
    `)
  }

  query.append(sql` ORDER BY is_default DESC, id ASC LIMIT ${limit + 1}`)

  const { rows } = await read(query)
  const items = rows as LandingPage[]
  const hasNextPage = items.length > limit
  const results = hasNextPage ? items.slice(0, limit) : items

  return {
    results,
    page_info: buildPageInfo(results, {
      hasNextPage,
      getCursor: page => ({
        tier: page.is_default ? 1 : 0,
        id: page.id,
        scope,
      }),
    }),
  }
}

function getLandingPagesForUserCursorScope(userId: string): string {
  return `landing-pages:user:${userId}:is-default-desc-id-asc`
}
