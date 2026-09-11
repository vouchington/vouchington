import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { decodeUuidCursor, isTimestampCursor, buildPageInfo } from '@modules/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import type { Crawler } from './types.mts'
import { toCrawler } from './get.mts'

export async function searchCrawlers(
  options: {
    limit?: number
    after?: string | null
  } = {},
): Promise<{ results: Crawler[]; page_info: PageInfo }> {
  const parsedLimit = options.limit ?? 25
  const limit = Number.isNaN(parsedLimit) || parsedLimit < 1 ? 25 : Math.min(parsedLimit, 100)

  let afterTimestamp: Date | null = null
  let afterId: string | null = null
  if (options.after) {
    const cursor = decodeUuidCursor(options.after, isTimestampCursor, 'Invalid cursor format')
    afterTimestamp = new Date(cursor.timestamp)
    afterId = cursor.id
  }

  const query = sql`/* searchCrawlers */
    SELECT
      c.id,
      c.hostname_id,
      c.description,
      c.crawler_type,
      c.priority,
      c.css_selectors_to_remove,
      c.link_text_content_to_remove,
      c.link_hrefs_to_remove,
      c.content_selectors,
      c.referral_program_id,
      c.created_at,
      c.updated_at,
      c.deleted_at
    FROM crawlers c
    WHERE c.deleted_at IS NULL`

  if (afterTimestamp !== null && afterId !== null) {
    query.append(
      sql` AND (c.created_at < ${afterTimestamp} OR (c.created_at = ${afterTimestamp} AND c.id < ${afterId}))`,
    )
  }

  query.append(sql` ORDER BY c.created_at DESC, c.id DESC LIMIT ${limit + 1}`)

  const { rows } = await read(query)
  const hasNextPage = rows.length > limit
  const results = (hasNextPage ? rows.slice(0, limit) : rows).map(toCrawler)

  const page_info = buildPageInfo(results, {
    hasNextPage,
    getCursor: item => ({ timestamp: item.created_at.getTime(), id: item.id }),
  })

  return { results, page_info }
}
