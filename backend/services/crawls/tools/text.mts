import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { sanitizePromptInjection, wrapExternalContent } from '@jongleberry/vurst-prompt'
import { buildValidCrawlChunksFilter } from './filters.mts'
import { buildExcludedHostnameIdsCTE } from '../sql-builders/index.mts'

type SearchCrawlsOptions = {
  query: string
  limit?: number
  hostname?: string
  exclude_for_user_id?: string
}

type CrawlSearchResult = {
  url_id: string
  crawl_id: string
  markdown: string
}

export async function toolsSearchCrawls(
  options: SearchCrawlsOptions,
): Promise<CrawlSearchResult[]> {
  const { query, limit = 5, hostname, exclude_for_user_id } = options
  const safeLimit = Math.min(Math.max(1, limit), 10)

  const sqlQuery = sql`/* toolsSearchCrawls */
    SELECT
      crawls.url_id,
      crawl_chunks.crawl_id,
      crawl_chunks.markdown,
      ts_rank(crawl_chunks.search_vector, websearch_to_tsquery('voucha_english', ${query})) AS rank
    FROM crawl_chunks
  `

  sqlQuery.append(buildValidCrawlChunksFilter())

  sqlQuery.append(sql`
    AND crawl_chunks.search_vector @@ websearch_to_tsquery('voucha_english', ${query})
  `)

  if (hostname) {
    sqlQuery.append(sql` AND url_hostnames.hostname = ${hostname}`)
  }

  if (exclude_for_user_id) {
    sqlQuery.append(
      sql` AND url_hostnames.id NOT IN (SELECT hostname_id FROM excluded_hostname_ids)`,
    )
  }

  sqlQuery.append(sql`
    ORDER BY rank DESC
    LIMIT ${safeLimit}
  `)

  // Prepend CTE for hostname exclusion when needed
  if (exclude_for_user_id) {
    const cte = sql`/* toolsSearchCrawls:withExclusions */ WITH `
    cte.append(buildExcludedHostnameIdsCTE(exclude_for_user_id))
    cte.append(sql` `)
    cte.append(sqlQuery)
    const { rows } = await read(cte)
    return formatResults(rows)
  }

  const { rows } = await read(sqlQuery)
  return formatResults(rows)
}

function formatResults(
  rows: Array<{ url_id: string; crawl_id: string; markdown: string }>,
): Promise<CrawlSearchResult[]> {
  return Promise.all(
    rows.map(async row => ({
      url_id: row.url_id,
      crawl_id: row.crawl_id,
      markdown: wrapExternalContent(await sanitizePromptInjection(row.markdown), {
        source: 'crawl',
        contentType: 'web_page',
      }),
    })),
  )
}
