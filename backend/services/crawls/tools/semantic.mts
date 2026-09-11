import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getCachedSearchEmbedding } from '@services/bedrock-embeddings/search'
import { sanitizePromptInjection, wrapExternalContent } from '@jongleberry/vurst-prompt'
import { buildValidCrawlChunksFilter } from './filters.mts'
import { buildExcludedHostnameIdsCTE } from '../sql-builders/index.mts'

type SearchCrawlsSemanticOptions = {
  query: string
  limit?: number
  hostname?: string
  exclude_for_user_id?: string
}

type CrawlSemanticSearchResult = {
  url_id: string
  crawl_id: string
  hostname: string
  markdown: string
  distance: number
}

export async function toolsSearchCrawlsSemantic(
  options: SearchCrawlsSemanticOptions,
): Promise<CrawlSemanticSearchResult[]> {
  const { query, limit = 5, hostname, exclude_for_user_id } = options
  const safeLimit = Math.min(Math.max(1, limit), 10)

  // Get embedding for query
  const embedding = await getCachedSearchEmbedding(query)

  const sqlQuery = sql`/* toolsSearchCrawlsSemantic */
    SELECT
      crawls.url_id,
      crawl_chunks.crawl_id,
      url_hostnames.hostname,
      crawl_chunks.markdown,
      (crawl_chunks.bedrock_nova_multimodal_v1_embedding <=> ${JSON.stringify(embedding)}::vector) AS distance
    FROM crawl_chunks
  `

  sqlQuery.append(buildValidCrawlChunksFilter())

  sqlQuery.append(sql`
    AND crawl_chunks.bedrock_nova_multimodal_v1_embedding IS NOT NULL
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
    ORDER BY distance ASC
    LIMIT ${safeLimit}
  `)

  // Prepend CTE for hostname exclusion when needed
  if (exclude_for_user_id) {
    const cte = sql`/* toolsSearchCrawlsSemantic:withExclusions */ WITH `
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
  rows: Array<{
    url_id: string
    crawl_id: string
    hostname: string
    markdown: string
    distance: string
  }>,
): Promise<CrawlSemanticSearchResult[]> {
  return Promise.all(
    rows.map(async row => ({
      url_id: row.url_id,
      crawl_id: row.crawl_id,
      hostname: row.hostname,
      markdown: wrapExternalContent(await sanitizePromptInjection(row.markdown), {
        source: 'crawl',
        contentType: 'web_page',
      }),
      distance: Number.parseFloat(row.distance),
    })),
  )
}
