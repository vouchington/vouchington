import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { beginTransaction, write } from '@data-stores/psql'
import onError from '@modules/on-error'
import {
  EMBEDDING_COLUMNS,
  EMBEDDING_DIMENSION,
  EMBEDDING_TABLES,
  EMBEDDINGS_TABLE,
} from '@services/bedrock-embeddings/config'
import { addEmbeddingHashesToBloomFilter } from '@services/bedrock-embeddings/bloom-filter/bloom-filter'
import { from as copyFrom } from 'pg-copy-streams'
import type { BatchUpdateItem } from '@services/bedrock-embeddings/batch/types'
import { csvEscape } from './csv.mts'

type EmbeddingTable = (typeof EMBEDDING_TABLES)[number]
export async function applyBatchUpdates(
  tableName: EmbeddingTable,
  items: BatchUpdateItem[],
): Promise<string[]> {
  if (items.length === 0) return []
  if (!EMBEDDING_TABLES.includes(tableName)) {
    throw new Error(`Invalid table name: ${tableName}`)
  }

  const tempTable = `temp_embedding_updates_${randomUUID().replaceAll('-', '')}`
  let updatedIds: string[] = []
  await using query = await beginTransaction()

  await query(
    `/* applyBatchUpdates */ CREATE TEMP TABLE ${tempTable} (
        entity_id TEXT NOT NULL,
        content_sha256 BYTEA NOT NULL,
        embedding VECTOR(${EMBEDDING_DIMENSION}) NOT NULL,
        input_token_count INT
      ) ON COMMIT DROP`,
  )

  const copyStream = query.client.query(
    copyFrom(
      `COPY ${tempTable} (entity_id, content_sha256, embedding, input_token_count) FROM STDIN WITH (FORMAT CSV)`,
    ),
  )
  await pipeline(Readable.from(generateEntityCsvRows(items)), copyStream)

  // Pre-lock target entity rows in ascending id order BEFORE the embedding upsert so
  // that both lock acquisitions happen in a consistent order (entity then embedding).
  // Without this, a concurrent transaction that already holds an entity row lock and then
  // needs an embedding lock can deadlock with us if we hold the embedding lock first.
  const entityIds = items.map(item => item.entity_id)
  // ast-grep-ignore: no-three-sequential-awaits
  await query(
    `/* applyBatchUpdates lockRows */
      SELECT id FROM ${tableName}
      WHERE id = ANY($1::uuid[])
      ORDER BY id
      FOR UPDATE`,
    [entityIds],
  )

  await query(
    `/* applyBatchUpdates */ INSERT INTO ${EMBEDDINGS_TABLE} (content_sha256, embedding, input_token_count)
      SELECT DISTINCT ON (content_sha256) content_sha256, embedding, input_token_count
      FROM ${tempTable}
      ORDER BY content_sha256, input_token_count NULLS LAST
      ON CONFLICT (content_sha256) DO UPDATE
        SET input_token_count = EXCLUDED.input_token_count
        WHERE ${EMBEDDINGS_TABLE}.input_token_count IS NULL
          AND EXCLUDED.input_token_count IS NOT NULL`,
  )

  const { rows } = await write<{ id: string }>(
    `/* applyBatchUpdates */ UPDATE ${tableName}
      SET ${EMBEDDING_COLUMNS.input_sha256} = u.content_sha256,
        ${EMBEDDING_COLUMNS.embedding} = u.embedding,
        ${EMBEDDING_COLUMNS.created_at} = NOW(),
        ${EMBEDDING_COLUMNS.input_token_count} = COALESCE(u.input_token_count, ${tableName}.${EMBEDDING_COLUMNS.input_token_count})
      FROM ${tempTable} u
      WHERE ${tableName}.id = u.entity_id::uuid
        AND ${tableName}.${EMBEDDING_COLUMNS.content_sha256} = u.content_sha256
      RETURNING ${tableName}.id`,
    { query },
  )
  updatedIds = rows.map((r: { id: string }) => r.id)

  await query.commit()

  const hexHashes = items.map(item => item.content_sha256.toString('hex'))
  addEmbeddingHashesToBloomFilter(hexHashes).catch(onError)
  return updatedIds
}

async function* generateEntityCsvRows(items: BatchUpdateItem[]): AsyncGenerator<string> {
  for (const item of items) {
    const tokenCount = item.input_token_count ?? ''
    yield `${csvEscape(item.entity_id)},\\x${item.content_sha256.toString('hex')},"[${item.embedding.join(',')}]",${tokenCount}\n`
  }
}
