import { lookupExistingEmbeddings } from '@services/embeddings/lookup'
import { insertCentralizedEmbeddingsBulk } from '@services/embeddings/centralized-table'
import { createCrawlChunkEmbeddingContent } from './content.mts'
import type { CrawlBasic } from '@voucha/types/entities/crawl'
import { write } from '@data-stores/psql'
import { chunk } from '@jongleberry/vurst-markdown'
import pgvector from 'pgvector/pg'

// Minimum meaningful content length (after trimming)
const MINIMUM_CONTENT_LENGTH = 3

type ChunkDataWithEmbedding = {
  index: number
  content: string
  contentSha256: Buffer
}

async function updateCrawlEmbeddingStatus(
  crawl: Pick<CrawlBasic, 'url_id' | 'id'>,
  hasPendingEmbeddings: boolean,
): Promise<void> {
  if (hasPendingEmbeddings) {
    await write(
      `/* updateCrawlEmbeddingStatus */
      UPDATE crawls
      SET has_pending_embeddings = TRUE
      WHERE url_id = $1
        AND id = $2
    `,
      [crawl.url_id, crawl.id],
    )
    return
  }

  await write(
    `/* updateCrawlEmbeddingStatus */
    UPDATE crawls
    SET has_pending_embeddings = FALSE,
      embeddings_generated_at = CURRENT_TIMESTAMP
    WHERE url_id = $1
      AND id = $2
  `,
    [crawl.url_id, crawl.id],
  )
}

export const createCrawlChunks = async (
  crawl: Pick<CrawlBasic, 'id' | 'url_id' | 'markdown' | 'meta_tags'>,
) => {
  if (
    !crawl.markdown ||
    crawl.markdown.trim().replaceAll(/\s+/g, ' ').length < MINIMUM_CONTENT_LENGTH
  ) {
    return {
      skipped: true,
      reason: 'content_too_short',
    }
  }

  const chunks = await chunk(Buffer.from(crawl.markdown), {
    title: (crawl.meta_tags?.title as string) || undefined,
  })

  if (chunks.length === 0) {
    return {
      skipped: true,
      reason: 'no_chunks',
    }
  }

  const chunkDataList: ChunkDataWithEmbedding[] = chunks.map((chunkData, index) => {
    const { content, content_sha256 } = createCrawlChunkEmbeddingContent(chunkData)
    return {
      index,
      content,
      contentSha256: content_sha256,
    }
  })

  const existingEmbeddings = await lookupExistingEmbeddings(chunkDataList.map(c => c.contentSha256))

  const embeddingInserts: string[] = []
  const embeddingValues: unknown[] = []

  let hasPendingEmbeddings = false

  // First, save any found embeddings to centralized table
  const centralizedEmbeddings = chunkDataList.flatMap(({ contentSha256 }) => {
    const hashHex = contentSha256.toString('hex')
    const existingEmbedding = existingEmbeddings.get(hashHex)
    if (!existingEmbedding) return []
    return [{ content_sha256: contentSha256, embedding: existingEmbedding.embedding }]
  })

  await insertCentralizedEmbeddingsBulk(centralizedEmbeddings)

  // Then insert crawl chunks with embeddings where available
  for (const { index: i, content, contentSha256 } of chunkDataList) {
    const hashHex = contentSha256.toString('hex')
    const existingEmbedding = existingEmbeddings.get(hashHex)

    if (!existingEmbedding) hasPendingEmbeddings = true
    embeddingInserts.push(`(
      $${embeddingValues.push(crawl.id)},
      $${embeddingValues.push(i)},
      $${embeddingValues.push(content)},
      $${embeddingValues.push(contentSha256)},
      ${existingEmbedding ? `$${embeddingValues.push(contentSha256)}` : 'NULL'},
      ${existingEmbedding ? `$${embeddingValues.push(pgvector.toSql(existingEmbedding.embedding))}` : 'NULL'},
      ${existingEmbedding ? `$${embeddingValues.push(existingEmbedding.created_at)}` : 'NULL'}
    )`)
  }

  await write(
    `/* createCrawlChunks */
    -- This dynamic VALUES list has no ON CONFLICT arbiter; chunk order is the source order_index.
    /* no-mistakes: deadlock-safe */
    INSERT INTO crawl_chunks (
      crawl_id,
      order_index,
      markdown,
      gemini_embedding_2_content_sha256,
      gemini_embedding_2_input_sha256,
      gemini_embedding_2_embedding,
      gemini_embedding_2_embedding_created_at
    )
    VALUES ${embeddingInserts.join(', ')}
  `,
    embeddingValues,
  )

  await updateCrawlEmbeddingStatus(crawl, hasPendingEmbeddings)

  return {
    chunks_created: embeddingInserts.length,
  }
}
