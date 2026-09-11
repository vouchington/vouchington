/**
 * Crawl chunks test verification helpers
 */

import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export { insertTestCrawlChunk, insertTestCrawlChunksBulk } from './crawl-chunks-insert.mts'

/**
 * Count crawl chunks matching the given filters.
 * Provide crawlId, urlId, or both. When both are given, validates the crawl belongs to that URL.
 */
export async function countCrawlChunks(filters: {
  urlId?: string
  crawlId?: string
}): Promise<number> {
  let query
  if (filters.crawlId && filters.urlId) {
    query = sql`
      SELECT COUNT(*) as count
      FROM crawl_chunks
      JOIN crawls ON crawls.id = crawl_chunks.crawl_id
      WHERE crawl_chunks.crawl_id = ${filters.crawlId}
        AND crawls.url_id = ${filters.urlId}
    `
  } else if (filters.crawlId) {
    query = sql`
      SELECT COUNT(*) as count
      FROM crawl_chunks
      WHERE crawl_id = ${filters.crawlId}
    `
  } else if (filters.urlId) {
    query = sql`
      SELECT COUNT(*) as count
      FROM crawl_chunks
      JOIN crawls ON crawls.id = crawl_chunks.crawl_id
      WHERE crawls.url_id = ${filters.urlId}
    `
  } else {
    throw new Error('countCrawlChunks requires either filters.crawlId or filters.urlId')
  }

  const { rows } = await read(query)
  return Number.parseInt(rows[0].count, 10)
}

/**
 * Get crawl chunks for a URL and crawl ID
 */
export async function getCrawlChunks(urlId: string, crawlId: string): Promise<unknown[]> {
  const { rows } = await read(sql`
    SELECT crawl_chunks.crawl_id, crawl_chunks.markdown, crawl_chunks.order_index
    FROM crawl_chunks
    JOIN crawls ON crawls.id = crawl_chunks.crawl_id
    WHERE crawl_chunks.crawl_id = ${crawlId}
      AND crawls.url_id = ${urlId}
    ORDER BY crawl_chunks.order_index
  `)

  return rows
}

/**
 * Get all crawl chunks for a URL
 */
export async function getAllCrawlChunksForUrl(urlId: string): Promise<unknown[]> {
  const { rows } = await read(sql`
    SELECT crawl_chunks.*
    FROM crawl_chunks
    JOIN crawls ON crawls.id = crawl_chunks.crawl_id
    WHERE crawls.url_id = ${urlId}
    ORDER BY crawl_chunks.crawl_id, crawl_chunks.order_index
  `)

  return rows
}

/**
 * Get crawl chunks with embedding status
 */
export async function getCrawlChunksWithEmbeddingStatus(
  urlId: string,
  crawlId: string,
): Promise<unknown[]> {
  const { rows } = await read(sql`
    SELECT crawl_chunks.bedrock_nova_multimodal_v1_embedding, crawl_chunks.bedrock_nova_multimodal_v1_embedding_created_at
    FROM crawl_chunks
    JOIN crawls ON crawls.id = crawl_chunks.crawl_id
    WHERE crawl_chunks.crawl_id = ${crawlId}
      AND crawls.url_id = ${urlId}
  `)

  return rows
}

/**
 * Get crawl chunks grouped by crawl_id with counts
 */
export async function getCrawlChunksGroupedByCrawl(
  urlId: string,
): Promise<Array<{ crawl_id: string; count: number }>> {
  const { rows } = await read(sql`
    SELECT crawl_chunks.crawl_id, COUNT(*)::int as count
    FROM crawl_chunks
    JOIN crawls ON crawls.id = crawl_chunks.crawl_id
    WHERE crawls.url_id = ${urlId}
    GROUP BY crawl_chunks.crawl_id
  `)

  return rows
}

/**
 * Check if a crawl has embeddings_generated_at set
 */
export async function getCrawlEmbeddingsGeneratedAt(
  urlId: string,
  crawlId: string,
): Promise<Date | null> {
  const { rows } = await read(sql`
    SELECT embeddings_generated_at
    FROM crawls
    WHERE url_id = ${urlId}
      AND id = ${crawlId}
  `)

  return rows[0]?.embeddings_generated_at || null
}

/**
 * Update crawl embeddings_generated_at timestamp
 */
export async function updateCrawlEmbeddingsGeneratedAt(
  urlId: string,
  crawlId: string,
  timestamp: Date,
): Promise<void> {
  await write(sql`
    UPDATE crawls
    SET embeddings_generated_at = ${timestamp}
    WHERE url_id = ${urlId}
      AND id = ${crawlId}
  `)
}
