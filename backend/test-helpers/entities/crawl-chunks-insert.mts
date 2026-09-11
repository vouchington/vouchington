import { write } from '@data-stores/psql'
import { insertTestCentralizedEmbeddingsBulk } from './_bedrock-embeddings-support.mts'
import pgvector from 'pgvector/pg'
import sql from 'sql-template-strings'

export async function insertTestCrawlChunk(data: {
  urlId: string
  crawlId: string
  orderIndex: number
  markdown: string
  contentSha256: string | Buffer
  embedding?: number[]
  tokens?: number
}): Promise<void> {
  if (data.embedding) {
    const contentSha256 =
      typeof data.contentSha256 === 'string'
        ? Buffer.from(data.contentSha256.replace(/^\\x/, ''), 'hex')
        : data.contentSha256

    await insertTestCentralizedEmbeddingsBulk([
      { content_sha256: contentSha256, embedding: data.embedding },
    ])

    await write(sql`
      INSERT INTO crawl_chunks (
        crawl_id,
        order_index,
        markdown,
        bedrock_nova_multimodal_v1_content_sha256,
        bedrock_nova_multimodal_v1_input_sha256,
        bedrock_nova_multimodal_v1_embedding,
        bedrock_nova_multimodal_v1_embedding_created_at
      )
      VALUES (
        ${data.crawlId},
        ${data.orderIndex},
        ${data.markdown},
        ${data.contentSha256},
        ${data.contentSha256},
        ${pgvector.toSql(data.embedding)},
        NOW()
      )
    `)
  } else {
    await write(sql`
      INSERT INTO crawl_chunks (crawl_id, order_index, markdown, bedrock_nova_multimodal_v1_content_sha256)
      VALUES (${data.crawlId}, ${data.orderIndex}, ${data.markdown}, ${data.contentSha256})
    `)
  }
}

export async function insertTestCrawlChunksBulk(
  chunks: Array<{
    urlId: string
    crawlId: string
    orderIndex: number
    markdown: string
    contentSha256: string
  }>,
): Promise<void> {
  for (const chunk of chunks) {
    await write(sql`
      INSERT INTO crawl_chunks (crawl_id, order_index, markdown, bedrock_nova_multimodal_v1_content_sha256)
      VALUES (${chunk.crawlId}, ${chunk.orderIndex}, ${chunk.markdown}, decode(${chunk.contentSha256}, 'hex'))
    `)
  }
}
