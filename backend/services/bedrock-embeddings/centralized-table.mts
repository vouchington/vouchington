import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { beginTransaction } from '@data-stores/psql'
import { from as copyFrom } from 'pg-copy-streams'
import onError from '@modules/on-error'
import { EMBEDDINGS_TABLE, EMBEDDING_DIMENSION } from './config.mts'
import { addEmbeddingHashesToBloomFilter } from './bloom-filter/bloom-filter.mts'

export async function insertCentralizedEmbeddingsBulk(
  embeddings: Array<{
    content_sha256: Buffer
    embedding: number[]
    input_token_count?: number | null
  }>,
): Promise<void> {
  if (embeddings.length === 0) return

  const tempTable = `temp_centralized_embeddings_${randomUUID().replaceAll('-', '')}`
  await using query = await beginTransaction()

  await query(
    `/* insertCentralizedEmbeddingsBulk */ CREATE TEMP TABLE ${tempTable} (
        content_sha256 BYTEA NOT NULL,
        embedding VECTOR(${EMBEDDING_DIMENSION}) NOT NULL,
        input_token_count INT
      ) ON COMMIT DROP`,
  )

  const copyStream = query.client.query(
    copyFrom(
      `COPY ${tempTable} (content_sha256, embedding, input_token_count) FROM STDIN WITH (FORMAT CSV)`,
    ),
  )
  await pipeline(Readable.from(generateCsvRows(embeddings)), copyStream)

  await query(
    `/* insertCentralizedEmbeddingsBulk */ INSERT INTO ${EMBEDDINGS_TABLE} (content_sha256, embedding, input_token_count)
      SELECT DISTINCT ON (content_sha256) content_sha256, embedding, input_token_count
      FROM ${tempTable}
      ORDER BY content_sha256, input_token_count NULLS LAST
      ON CONFLICT (content_sha256) DO UPDATE
        SET input_token_count = EXCLUDED.input_token_count
        WHERE ${EMBEDDINGS_TABLE}.input_token_count IS NULL
          AND EXCLUDED.input_token_count IS NOT NULL`,
  )

  await query.commit()

  const hexHashes = embeddings.map(e => e.content_sha256.toString('hex'))
  addEmbeddingHashesToBloomFilter(hexHashes).catch(onError)
}

async function* generateCsvRows(
  embeddings: Array<{
    content_sha256: Buffer
    embedding: number[]
    input_token_count?: number | null
  }>,
): AsyncGenerator<string> {
  for (const emb of embeddings) {
    const tokenCount = emb.input_token_count ?? ''
    yield `\\x${emb.content_sha256.toString('hex')},"[${emb.embedding.join(',')}]",${tokenCount}\n`
  }
}
