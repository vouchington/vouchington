import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

type CrawlChunkSearchResult = {
  url_id: string
  crawl_id: string
  markdown: string
}

export async function searchCrawlChunks(
  query: string,
  limit: number,
): Promise<CrawlChunkSearchResult[]> {
  const { rows } = await read(sql`/* searchCrawlChunks */
    SELECT
      crawls.url_id,
      crawl_chunks.crawl_id,
      crawl_chunks.markdown,
      ts_rank(crawl_chunks.search_vector, websearch_to_tsquery('voucha_english', ${query})) AS rank
    FROM crawl_chunks
    JOIN crawls ON crawls.id = crawl_chunks.crawl_id
    WHERE crawl_chunks.search_vector @@ websearch_to_tsquery('voucha_english', ${query})
    ORDER BY rank DESC
    LIMIT ${limit}
  `)

  return rows.map(row => ({
    url_id: row.url_id as string,
    crawl_id: row.crawl_id as string,
    markdown: row.markdown as string,
  }))
}
