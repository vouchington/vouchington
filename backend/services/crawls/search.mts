import { read } from '@data-stores/psql'
import sql, { type SQLStatement } from 'sql-template-strings'
import { buildPageInfo, decodeScopedUuidCursorWithLegacySimple } from '@modules/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import { clampLimit } from '@modules/search-utils'
import type { CrawlBasic } from './types.mts'
import type { PaidSafeUrlCrawlHistory } from './public-url-response.mts'

type SearchCrawlsForUrlOptions = {
  after?: string
  limit?: number
}

function getUrlCrawlCursorScope(urlId: string): string {
  return `url:${urlId}:crawls`
}

export async function searchCrawlsForUrl(
  urlId: string,
  options: SearchCrawlsForUrlOptions = {},
): Promise<{
  results: CrawlBasic[]
  page_info: PageInfo
}> {
  const { after } = options
  const safeLimit = clampLimit(options.limit, 50)
  const cursorScope = getUrlCrawlCursorScope(urlId)

  const filters: SQLStatement[] = [sql`url_id = ${urlId}`]

  if (after) {
    const cursor = decodeScopedUuidCursorWithLegacySimple(
      after,
      cursorScope,
      'Invalid URL crawl cursor',
    )

    filters.push(sql`id < ${cursor.id}`)
  }

  const query = sql`/* searchCrawlsForUrl */
    SELECT
      id,
      url_id,
      crawler_id,
      created_at,
      last_modified_at,
      etag,
      request_headers,
      response_headers,
      response_status_code,
      redirect_url_id,
      network_error,
      completed_at,
      embeddings_generated_at,
      has_pending_embeddings,
      markdown,
      title,
      links,
      meta_tags,
      embed_metadata,
      embed_oembed_url,
      embed_oembed_resolved_at,
      lang
    FROM crawls
    WHERE `

  filters.forEach((filter, index) => {
    if (index > 0) query.append(sql` AND `)
    query.append(filter)
  })

  query.append(sql`
    ORDER BY id DESC
    LIMIT ${safeLimit + 1}
  `)

  const { rows } = await read(query)
  const crawls = rows.map(row => ({
    __entity_type: 'crawl' as const,
    ...row,
  }))

  const hasNextPage = crawls.length > safeLimit
  const results = crawls.slice(0, safeLimit)

  return {
    results,
    page_info: buildPageInfo(results, {
      hasNextPage,
      getCursor: result => ({ id: result.id, scope: cursorScope }),
    }),
  }
}

export async function searchPublicUrlCrawlsForUrl(
  urlId: string,
  options: SearchCrawlsForUrlOptions = {},
): Promise<{
  results: PaidSafeUrlCrawlHistory[]
  page_info: PageInfo
}> {
  const { after } = options
  const safeLimit = clampLimit(options.limit, 50)
  const cursorScope = getUrlCrawlCursorScope(urlId)

  const filters: SQLStatement[] = [sql`url_id = ${urlId}`]

  if (after) {
    const cursor = decodeScopedUuidCursorWithLegacySimple(
      after,
      cursorScope,
      'Invalid URL crawl cursor',
    )

    filters.push(sql`id < ${cursor.id}`)
  }

  const query = sql`/* searchPublicUrlCrawlsForUrl */
    SELECT
      id,
      created_at,
      response_status_code,
      completed_at,
      title,
      lang
    FROM crawls
    WHERE `

  filters.forEach((filter, index) => {
    if (index > 0) query.append(sql` AND `)
    query.append(filter)
  })

  query.append(sql`
    ORDER BY id DESC
    LIMIT ${safeLimit + 1}
  `)

  const { rows } = await read(query)
  const crawls = rows.map(row => ({
    __entity_type: 'crawl' as const,
    ...row,
  }))

  const hasNextPage = crawls.length > safeLimit
  const results = crawls.slice(0, safeLimit)

  return {
    results,
    page_info: buildPageInfo(results, {
      hasNextPage,
      getCursor: result => ({ id: result.id, scope: cursorScope }),
    }),
  }
}
