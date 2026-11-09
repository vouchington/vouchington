import sql from 'sql-template-strings'

export type WebSearchQueryParams = {
  query: string
  likeQuery: string
  recentCrawlCutoffId: string
  /** Matching chunks ranked before the best chunk per URL is chosen. */
  chunkCap: number
  /** Page size plus the has-more probe row. */
  fetchLimit: number
  /** Resume after this content row; null starts at the first content row. */
  contentScore: number | null
  contentId: string | null
  /** A URL-tier cursor skips content, which precedes every URL-only match. */
  skipContent: boolean
  urlCursorId: string | null
}

/**
 * Content matches come from the top `chunkCap` chunks by rank, then the best chunk per URL.
 * URL-only matches follow them and exclude URLs already matched through that capped set.
 */
export function buildWebSearchQuery(params: WebSearchQueryParams) {
  const { recentCrawlCutoffId, chunkCap, fetchLimit } = params
  return sql`/* searchWeb */
    WITH q AS (
      SELECT websearch_to_tsquery('voucha_english', ${params.query}) AS tsq
    ),
    ranked_chunks AS (
      SELECT
        crawls.url_id,
        crawl_chunks.crawl_id,
        crawl_chunks.order_index,
        ts_rank(crawl_chunks.search_vector, q.tsq) AS rank,
        crawl_chunks.markdown AS chunk_markdown
      FROM crawl_chunks
      CROSS JOIN q
      JOIN crawls ON crawls.id = crawl_chunks.crawl_id
      JOIN urls ON urls.id = crawls.url_id
      JOIN url_hostnames ON url_hostnames.id = urls.hostname_id
      WHERE NOT url_hostnames.is_blocked
        AND url_hostnames.is_crawlable
        AND crawls.embeddings_generated_at IS NOT NULL
        AND crawls.response_status_code = 200
        AND crawls.completed_at IS NOT NULL
        AND crawls.network_error IS NULL
        AND crawls.id >= ${recentCrawlCutoffId}
        AND crawl_chunks.search_vector @@ q.tsq
        AND querytree(q.tsq) NOT IN ('', 'T')
      ORDER BY rank DESC, crawls.url_id DESC, crawl_chunks.crawl_id DESC, crawl_chunks.order_index DESC
      LIMIT ${chunkCap}
    ),
    content AS (
      SELECT DISTINCT ON (url_id) url_id, rank, chunk_markdown
      FROM ranked_chunks
      ORDER BY url_id, rank DESC, crawl_id DESC, order_index DESC
    ),
    content_page AS (
      SELECT url_id, rank, chunk_markdown
      FROM content
      WHERE NOT ${params.skipContent}::boolean
        AND (
          ${params.contentScore}::float4 IS NULL
          OR (rank, url_id) < (${params.contentScore}::float4, ${params.contentId}::uuid)
        )
      ORDER BY rank DESC, url_id DESC
      LIMIT ${fetchLimit}
    ),
    url_match AS (
      SELECT urls.id AS url_id
      FROM urls
      JOIN url_hostnames ON url_hostnames.id = urls.hostname_id
      WHERE urls.url ILIKE ${params.likeQuery}
        AND NOT url_hostnames.is_blocked
        AND url_hostnames.is_crawlable
        AND (${params.urlCursorId}::uuid IS NULL OR urls.id < ${params.urlCursorId}::uuid)
        AND NOT EXISTS (
          SELECT 1 FROM content WHERE content.url_id = urls.id
        )
      ORDER BY urls.id DESC
      LIMIT ${fetchLimit}
    ),
    merged AS (
      SELECT url_id, rank, chunk_markdown, (rank IS NULL) AS rank_is_null FROM content_page
      UNION ALL
      SELECT url_id, NULL::float4, NULL::text, true AS rank_is_null FROM url_match
      ORDER BY rank_is_null, rank DESC NULLS LAST, url_id DESC
      LIMIT ${fetchLimit}
    )
    SELECT
      view_urls.*,
      merged.rank AS cursor_score,
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
  `
}
