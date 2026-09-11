import { read } from '@data-stores/psql'
import sql, { type SQLStatement } from 'sql-template-strings'
import { buildPageInfo, decodeUuidCursor, isSimpleCursor } from '@modules/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import assert from 'http-assert'
import { clampLimit } from '@modules/search-utils'
import type { ViewUrl } from './types.mts'

export type SearchUrlsOptions = {
  query?: string
  hostnameId?: string
  contentTypeId?: string | number
  after?: string
  limit?: number
  excludeBlockedHostnames?: boolean
}

function buildUrlFilters(options: SearchUrlsOptions): SQLStatement[] {
  const { query, hostnameId, contentTypeId, after, excludeBlockedHostnames } = options
  const filters: SQLStatement[] = []
  const normalizedQuery = query?.trim()

  if (normalizedQuery) {
    assert(normalizedQuery.length >= 3, 400, 'URL search query must be at least 3 characters')
    // NOTE: idx_urls__url_trgm accelerates this pattern for queries with at least
    // 3 characters. Shorter queries may still fall back to a sequential scan.
    filters.push(sql`urls.url ILIKE ${`%${normalizedQuery}%`}`)
  }

  if (hostnameId) {
    filters.push(sql`urls.hostname_id = ${hostnameId}`)
  }

  if (contentTypeId !== undefined) {
    filters.push(sql`urls.url_content_type_id = ${contentTypeId}`)
  }

  if (after) {
    const cursor = decodeUuidCursor(
      after,
      isSimpleCursor,
      'Invalid cursor format: expected simple cursor',
    )

    filters.push(sql`urls.id < ${cursor.id}`)
  }

  if (excludeBlockedHostnames) {
    filters.push(
      sql`urls.hostname_id IN (SELECT id FROM url_hostnames WHERE (blocked IS NOT TRUE))`,
    )
  }

  return filters
}

function appendWhereClauses(query: SQLStatement, filters: SQLStatement[]) {
  if (filters.length === 0) return
  query.append(sql` WHERE `)
  filters.forEach((filter, index) => {
    if (index > 0) query.append(sql` AND `)
    query.append(filter)
  })
}

export async function searchUrls(options: SearchUrlsOptions = {}): Promise<{
  results: ViewUrl[]
  page_info: PageInfo
}> {
  const safeLimit = clampLimit(options.limit, 50)
  const filters = buildUrlFilters(options)

  const query = sql`/* searchUrls */
    WITH limited_urls AS (
      SELECT urls.id
      FROM urls
  `
  appendWhereClauses(query, filters)
  query.append(sql`
      ORDER BY urls.id DESC
      LIMIT ${safeLimit + 1}
    )
    SELECT view_urls.*
    FROM view_urls
    JOIN limited_urls ON limited_urls.id = view_urls.id
    ORDER BY view_urls.id DESC
  `)

  const { rows } = await read(query)
  const urls = rows as ViewUrl[]

  const hasNextPage = urls.length > safeLimit
  const results = urls.slice(0, safeLimit)

  return {
    results,
    page_info: buildPageInfo(results, {
      hasNextPage,
      getCursor: result => ({ id: result.id }),
    }),
  }
}
