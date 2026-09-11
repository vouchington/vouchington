import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { buildPageInfo } from '@modules/pagination'
import { clampLimit } from '@modules/search-utils'
import { getMinUUIDv7ForDate } from '@modules/utils'
import assert from 'http-assert'
import type { ViewUrl } from '@services/urls/types'
import type { WebSearchOptions, WebSearchResponse, WebSearchResult } from './types.mts'

/**
 * Full-text search over crawled pages and URL-string match.
 *
 * The hostname/crawl filter logic mirrors `buildValidCrawlChunksFilter()` from
 * `@services/crawls/tools/filters.mts` — inlined here because the CTE structure
 * requires the conditions to be embedded inside the `content` CTE rather than
 * appended as a fragment.
 */
export async function searchWeb(options: WebSearchOptions): Promise<WebSearchResponse> {
  const { query } = options
  assert(query.trim().length >= 3, 400, 'Web search query must be at least 3 characters')

  const recentCrawlCutoffId = getMinUUIDv7ForDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
  const escapedQuery = query.replace(/[\\%_]/g, '\\$&')
  const likeQuery = `%${escapedQuery}%`
  const safeLimit = Math.trunc(clampLimit(options.limit, 100))

  const { rows } = await read(sql`/* searchWeb */
    WITH q AS (
      SELECT websearch_to_tsquery('voucha_english', ${query}) AS tsq
    ),
    content AS (
      SELECT DISTINCT ON (crawls.url_id)
        crawls.url_id,
        ts_rank(crawl_chunks.search_vector, q.tsq) AS rank,
        crawl_chunks.markdown AS chunk_markdown
      FROM crawl_chunks
      CROSS JOIN q
      JOIN crawls ON crawls.id = crawl_chunks.crawl_id
      JOIN urls ON urls.id = crawls.url_id
      JOIN url_hostnames ON url_hostnames.id = urls.hostname_id
      WHERE url_hostnames.blocked = false
        AND url_hostnames.crawlable = true
        AND crawls.embeddings_generated_at IS NOT NULL
        AND crawls.response_status_code = 200
        AND crawls.completed_at IS NOT NULL
        AND crawls.network_error IS NULL
        AND crawls.id >= ${recentCrawlCutoffId}
        AND crawl_chunks.search_vector @@ q.tsq
        AND querytree(q.tsq) NOT IN ('', 'T')
      ORDER BY crawls.url_id, rank DESC
    ),
    url_match AS (
      SELECT urls.id AS url_id
      FROM urls
      JOIN url_hostnames ON url_hostnames.id = urls.hostname_id
      WHERE urls.url ILIKE ${likeQuery}
        AND url_hostnames.blocked = false
        AND url_hostnames.crawlable = true
        AND NOT EXISTS (
          SELECT 1 FROM content WHERE content.url_id = urls.id
        )
      ORDER BY urls.id DESC
      LIMIT ${safeLimit}
    ),
    merged AS (
      SELECT url_id, rank, chunk_markdown, (rank IS NULL) AS rank_is_null FROM content
      UNION ALL
      SELECT url_id, NULL::float4, NULL::text, true AS rank_is_null FROM url_match
      ORDER BY rank_is_null, rank DESC NULLS LAST, url_id DESC
      LIMIT ${safeLimit}
    )
    SELECT
      view_urls.*,
      CASE WHEN merged.chunk_markdown IS NOT NULL
        THEN ts_headline(
          'voucha_english',
          merged.chunk_markdown,
          q.tsq,
          'StartSel=⟦MARK⟧, StopSel=⟦/MARK⟧, MaxFragments=2, MinWords=5, MaxWords=30'
        )
        ELSE NULL
      END AS snippet,
      CASE WHEN merged.rank IS NOT NULL THEN 'content'::text ELSE 'url'::text END AS match_type
    FROM merged
    CROSS JOIN q
    JOIN view_urls ON view_urls.id = merged.url_id
    /* outer ORDER BY re-applies the same sort after the view_urls JOIN; do not remove — it
       ensures deterministic output even though merged already limits and sorts internally */
    ORDER BY merged.rank_is_null, merged.rank DESC NULLS LAST, view_urls.id DESC
  `)

  const results: WebSearchResult[] = rows.map(({ snippet, match_type, ...url }) => ({
    url: url as ViewUrl,
    snippet: snippet as string | null,
    match_type: match_type as 'content' | 'url',
  }))

  const page_info = buildPageInfo(results, {
    hasNextPage: false,
    getCursor: r => ({ id: r.url.id }),
  })

  return { results, page_info }
}
