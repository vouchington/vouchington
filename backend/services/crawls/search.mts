import { clampLimit } from '@services/pagination'
import { read } from '@data-stores/psql'
import sql, { type SQLStatement } from 'sql-template-strings'
import { buildPageInfo, decodeScopedUuidCursor } from '@modules/pagination'
import type { PageInfo } from '@voucha/types/pagination'

import type { CrawlBasic } from './types.mts'
import type { PaidSafeUrlCrawlHistory } from './public-url-response.mts'

type SearchCrawlsForUrlOptions = {
  after?: string
  limit?: number
}

type UrlCrawlHistory = Omit<CrawlBasic, 'html_sha256' | 'html_snapshot_uploaded_at'>

type UrlCrawlIdRow = {
  id: string
}

export async function searchCrawlsForUrl(
  urlId: string,
  options: SearchCrawlsForUrlOptions = {},
): Promise<{
  results: UrlCrawlHistory[]
  page_info: PageInfo
}> {
  return searchUrlCrawlPage<Omit<UrlCrawlHistory, '__entity_type'>>(
    urlId,
    options,
    sql`/* searchCrawlsForUrl */
    SELECT
      id,
      url_id,
      hostname_crawler_configuration_id,
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
      language
    FROM crawls
    WHERE `,
  )
}

export async function searchPublicUrlCrawlsForUrl(
  urlId: string,
  options: SearchCrawlsForUrlOptions = {},
): Promise<{
  results: PaidSafeUrlCrawlHistory[]
  page_info: PageInfo
}> {
  return searchUrlCrawlPage<Omit<PaidSafeUrlCrawlHistory, '__entity_type'>>(
    urlId,
    options,
    sql`/* searchPublicUrlCrawlsForUrl */
    SELECT
      id,
      created_at,
      response_status_code,
      completed_at,
      title,
      language
    FROM crawls
    WHERE `,
  )
}

function getUrlCrawlCursorScope(urlId: string): string {
  return `url:${urlId}:crawls`
}

async function searchUrlCrawlPage<Row extends UrlCrawlIdRow>(
  urlId: string,
  options: SearchCrawlsForUrlOptions,
  selectFromWhere: SQLStatement,
): Promise<{
  results: Array<Row & { __entity_type: 'crawl' }>
  page_info: PageInfo
}> {
  const { after } = options
  const safeLimit = clampLimit(options.limit, 50)
  const cursorScope = getUrlCrawlCursorScope(urlId)
  const filters: SQLStatement[] = [sql`url_id = ${urlId}`]

  if (after) {
    const cursor = decodeScopedUuidCursor(after, cursorScope, 'Invalid URL crawl cursor')

    filters.push(sql`id < ${cursor.id}`)
  }

  const query = selectFromWhere

  filters.forEach((filter, index) => {
    if (index > 0) query.append(sql` AND `)
    query.append(filter)
  })

  query.append(sql`
    ORDER BY id DESC
    LIMIT ${safeLimit + 1}
  `)

  const { rows } = await read<Row>(query)
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
