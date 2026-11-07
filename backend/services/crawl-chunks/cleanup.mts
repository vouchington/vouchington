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
      -- no-mistakes-disable-next-line postgres-bounded-statements: the join is keyed by crawls.url_id for only the URLs completed in this call (updated_crawls) and matches only crawls whose has_pending_embeddings is still true, so in steady state it touches the one just-superseded crawl per URL; crawls per URL are one row per recrawl with no write cap, and the pending flag of each superseded crawl must clear in the same statement that removes its chunks.
      UPDATE crawls
      SET has_pending_embeddings = false
      FROM updated_crawls
      WHERE crawls.url_id = updated_crawls.url_id
        AND crawls.id < updated_crawls.crawl_id
        AND crawls.has_pending_embeddings
        AND NOT EXISTS (SELECT 1 FROM updated_crawls newer WHERE newer.crawl_id = crawls.id)
    )
    -- no-mistakes-disable-next-line postgres-bounded-statements: the join is keyed by old_crawl.url_id for only the URLs completed in this call (updated_crawls) and then probes crawl_chunks by crawl_id, so in steady state it deletes the chunks of the one just-superseded crawl per URL; crawls per URL (one per recrawl) and chunks per crawl (one page) have no write cap, and completion must delete every chunk of every superseded crawl of those URLs.
    DELETE FROM crawl_chunks
    USING updated_crawls, crawls old_crawl
    WHERE old_crawl.url_id = updated_crawls.url_id
      AND old_crawl.id < updated_crawls.crawl_id
      AND crawl_chunks.crawl_id = old_crawl.id
  `,
    [crawlIds],
  )
}
