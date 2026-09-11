import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export const deleteOldCrawlChunks = async (
  urlId: string,
  currentCrawlId: string,
): Promise<void> => {
  await write(
    `/* deleteOldCrawlChunks */
    DELETE FROM crawl_chunks
    USING crawls c
    WHERE c.url_id = $1
      AND c.id != $2
      AND crawl_chunks.crawl_id = c.id
  `,
    [urlId, currentCrawlId],
  )
}

export const finalizeChunksIfCompleteForMany = async (crawlIds: string[]): Promise<void> => {
  if (crawlIds.length === 0) return

  await write(
    `/* finalizeChunksIfCompleteForMany */
    WITH pairs AS (
      SELECT id AS crawl_id, url_id
      FROM crawls
      WHERE id = ANY($1::uuid[])
    ),
    complete_crawls AS (
      SELECT p.url_id, p.crawl_id
      FROM pairs p
      WHERE NOT EXISTS (
        SELECT 1 FROM crawl_chunks cc
        WHERE cc.crawl_id = p.crawl_id
          AND cc.bedrock_nova_multimodal_v1_embedding_created_at IS NULL
      )
    ),
    updated_crawls AS (
      UPDATE crawls
      SET has_pending_embeddings = false,
          embeddings_generated_at = NOW()
      FROM complete_crawls
      WHERE crawls.url_id = complete_crawls.url_id
        AND crawls.id = complete_crawls.crawl_id
        AND crawls.embeddings_generated_at IS NULL
      RETURNING crawls.url_id, crawls.id AS crawl_id
    )
    DELETE FROM crawl_chunks
    USING updated_crawls, crawls old_crawl
    WHERE old_crawl.url_id = updated_crawls.url_id
      AND old_crawl.id < updated_crawls.crawl_id
      AND crawl_chunks.crawl_id = old_crawl.id
  `,
    [crawlIds],
  )
}

export const finalizeChunksIfComplete = async (
  urlId: string,
  crawlId: string,
): Promise<boolean> => {
  const { rows } = await read(sql`/* finalizeChunksIfComplete */
    SELECT 1
    FROM crawl_chunks
    WHERE crawl_id = ${crawlId}
      AND bedrock_nova_multimodal_v1_embedding_created_at IS NULL
    LIMIT 1
  `)

  if (rows.length > 0) {
    return false
  }

  await write(sql`/* finalizeChunksIfComplete */
    UPDATE crawls
    SET has_pending_embeddings = false,
        embeddings_generated_at = NOW()
    WHERE url_id = ${urlId}
      AND id = ${crawlId}
      AND embeddings_generated_at IS NULL
  `)
  await deleteOldCrawlChunks(urlId, crawlId)
  return true
}
