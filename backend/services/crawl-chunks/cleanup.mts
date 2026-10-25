import { write } from '@data-stores/psql'

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
    ),
    superseded_crawls AS (
      -- Older crawls lose their chunks below, so their pending marker has no work left.
      UPDATE crawls
      SET has_pending_embeddings = false
      FROM updated_crawls
      WHERE crawls.url_id = updated_crawls.url_id
        AND crawls.id < updated_crawls.crawl_id
        AND crawls.has_pending_embeddings
        AND NOT EXISTS (SELECT 1 FROM updated_crawls newer WHERE newer.crawl_id = crawls.id)
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
