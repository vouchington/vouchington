import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createAsyncGeneratorFromCursor, beginTransaction } from '@data-stores/psql'
import { from as copyFrom } from 'pg-copy-streams'
import { EMBEDDING_DIMENSION, EMBEDDINGS_TABLE } from '@services/bedrock-embeddings/config'
import type { BatchUpdateItem } from '@services/bedrock-embeddings/batch/types'
import { lockExistsClause } from '@services/bedrock-embeddings/batch/lock-targets'
import { createCrawlChunkEntityId, parseCrawlChunkEntityId } from './crawl-chunk-entity-id.mts'

type PendingCrawlChunk = {
  id: string
  content: string
  content_sha256: Buffer
  url_id: string
  crawl_id: string
  order_index: number
}

export async function* streamPendingCrawlChunks(): AsyncGenerator<
  PendingCrawlChunk,
  void,
  unknown
> {
  const query = `/* streamPendingCrawlChunks */
    SELECT
      c.url_id,
      cc.crawl_id,
      cc.order_index,
      cc.markdown,
      cc.bedrock_nova_multimodal_v1_content_sha256
    FROM crawl_chunks cc
    INNER JOIN crawls c ON cc.crawl_id = c.id
    WHERE c.has_pending_embeddings = TRUE
      AND (
        cc.bedrock_nova_multimodal_v1_input_sha256 IS NULL
        OR cc.bedrock_nova_multimodal_v1_input_sha256 != cc.bedrock_nova_multimodal_v1_content_sha256
      )
      AND NOT ${lockExistsClause('crawl_chunks', '(cc.crawl_id, cc.order_index)')}
    ORDER BY COALESCE(c.embeddings_generated_at, uuid_extract_timestamp(c.id)) DESC, cc.crawl_id, cc.order_index
  `

  for await (const row of createAsyncGeneratorFromCursor<{
    url_id: string
    crawl_id: string
    order_index: number
    markdown: string
    bedrock_nova_multimodal_v1_content_sha256: Buffer
  }>(query, [], { batchSize: 1000 })) {
    const compositeId = createCrawlChunkEntityId(row.crawl_id, row.order_index)

    yield {
      id: compositeId,
      content: row.markdown,
      content_sha256: row.bedrock_nova_multimodal_v1_content_sha256,
      url_id: row.url_id,
      crawl_id: row.crawl_id,
      order_index: row.order_index,
    }
  }
}

export async function applyCrawlChunkBatchUpdates(items: BatchUpdateItem[]): Promise<void> {
  if (items.length === 0) return

  const parsed = items.flatMap(item => {
    const p = parseCrawlChunkEntityId(item.entity_id)
    if (p === null) return []
    return [
      {
        content_sha256: item.content_sha256,
        embedding: item.embedding,
        input_token_count: item.input_token_count,
        parsed: p,
      },
    ]
  })

  if (parsed.length === 0) return

  const tempTable = `temp_crawl_chunk_updates_${randomUUID().replaceAll('-', '')}`
  await using query = await beginTransaction()

  await query(
    `/* applyCrawlChunkBatchUpdates */ CREATE TEMP TABLE ${tempTable} (
        crawl_id UUID NOT NULL,
        order_index INT NOT NULL,
        content_sha256 BYTEA NOT NULL,
        embedding VECTOR(${EMBEDDING_DIMENSION}) NOT NULL,
        input_token_count INT
      ) ON COMMIT DROP`,
  )

  const copyStream = query.client.query(
    copyFrom(
      `COPY ${tempTable} (crawl_id, order_index, content_sha256, embedding, input_token_count) FROM STDIN WITH (FORMAT CSV)`,
    ),
  )
  // ast-grep-ignore: no-three-sequential-awaits -- service workflow has dependent validation, mutation, and follow-up side effects
  await pipeline(Readable.from(generateCrawlChunkCsvRows(parsed)), copyStream)

  await query(
    `/* applyCrawlChunkBatchUpdates */ INSERT INTO ${EMBEDDINGS_TABLE} (content_sha256, embedding, input_token_count)
      SELECT DISTINCT ON (content_sha256) content_sha256, embedding, input_token_count
      FROM ${tempTable}
      ORDER BY content_sha256, input_token_count NULLS LAST
      ON CONFLICT (content_sha256) DO UPDATE
        SET input_token_count = EXCLUDED.input_token_count
        WHERE ${EMBEDDINGS_TABLE}.input_token_count IS NULL
          AND EXCLUDED.input_token_count IS NOT NULL`,
  )

  await query(
    `/* applyCrawlChunkBatchUpdates */ UPDATE crawl_chunks
      SET bedrock_nova_multimodal_v1_input_sha256 = u.content_sha256,
        bedrock_nova_multimodal_v1_embedding = u.embedding,
        bedrock_nova_multimodal_v1_embedding_created_at = NOW(),
        bedrock_nova_multimodal_v1_input_token_count = COALESCE(u.input_token_count, crawl_chunks.bedrock_nova_multimodal_v1_input_token_count)
      FROM ${tempTable} u
      WHERE crawl_chunks.crawl_id = u.crawl_id
        AND crawl_chunks.order_index = u.order_index`,
  )

  await query.commit()
}

async function* generateCrawlChunkCsvRows(
  items: Array<{
    content_sha256: Buffer
    embedding: number[]
    input_token_count: number | null
    parsed: { crawlId: string; orderIndex: number }
  }>,
): AsyncGenerator<string> {
  for (const item of items) {
    const tokenCount = item.input_token_count ?? ''
    yield `${item.parsed.crawlId},${item.parsed.orderIndex},\\x${item.content_sha256.toString('hex')},"[${item.embedding.join(',')}]",${tokenCount}\n`
  }
}
