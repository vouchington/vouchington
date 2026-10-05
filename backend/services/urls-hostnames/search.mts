import { read } from '@data-stores/psql'
import { buildPageInfo, decodeUuidCursor, isNameCursor } from '@modules/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import { buildSearchUrlHostnamesQuery } from './search-query.mts'
import type { ViewHostname } from './types.mts'
import type { SearchUrlHostnamesOptions } from './search-types.mts'
export type { SearchUrlHostnamesOptions } from './search-types.mts'

export const searchUrlHostnames = async (
  options: SearchUrlHostnamesOptions = {},
): Promise<{ results: ViewHostname[]; page_info: PageInfo }> => {
  const { effectiveLimit, searchQuery } = buildSearchUrlHostnamesQuery(options)
  const { rows } = await read(searchQuery)
  const all = rows as ViewHostname[]
  const hasNextPage = all.length > effectiveLimit
  const results = all.slice(0, effectiveLimit)

  return {
    results,
    page_info: buildPageInfo(results, {
      hasNextPage,
      getCursor:
        options.sort === 'trust'
          ? h => ({ score: h.votes_score_net ?? 0, id: h.id })
          : h => ({ name: h.hostname, id: h.id }),
    }),
  }
}

export type SearchBlockedHostnamesOptions = {
  after?: string
  limit?: number
}

export async function searchBlockedHostnames(
  options: SearchBlockedHostnamesOptions = {},
): Promise<{ results: ViewHostname[]; page_info: PageInfo }> {
  const limit = Math.max(
    1,
    Math.min(100, Number.isFinite(options.limit) ? (options.limit as number) : 25),
  )
  const values: unknown[] = []
  const filters: string[] = ['is_blocked = TRUE']

  if (options.after) {
    const cursor = decodeUuidCursor(
      options.after,
      isNameCursor,
      'Invalid cursor format: expected name cursor',
    )
    const nameIdx = values.push(cursor.name)
    const idIdx = values.push(cursor.id)
    filters.push(`(hostname > $${nameIdx} OR (hostname = $${nameIdx} AND id > $${idIdx}))`)
  }

  const where = `WHERE ${filters.join(' AND ')}`
  values.push(limit + 1)

  const { rows } = await read(
    `/* searchBlockedHostnames */
    SELECT * FROM view_url_hostnames
    ${where}
    ORDER BY hostname ASC, id ASC
    LIMIT $${values.length}`,
    values,
  )

  const all = rows as ViewHostname[]
  const hasNextPage = all.length > limit
  const results = all.slice(0, limit)

  return {
    results,
    page_info: buildPageInfo(results, {
      hasNextPage,
      getCursor: h => ({ name: h.hostname, id: h.id }),
    }),
  }
}
