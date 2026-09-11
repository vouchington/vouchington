import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { beginTransaction, write } from '@data-stores/psql'
import { IMAGE_EMBEDDINGS_TABLE, EMBEDDING_DIMENSION } from '@services/bedrock-embeddings/config'
import { from as copyFrom } from 'pg-copy-streams'
import type { ImageBatchUpdateItem } from '@services/bedrock-embeddings/batch/types'
import { csvEscape } from './csv.mts'

export async function applyImageBatchUpdates(items: ImageBatchUpdateItem[]): Promise<string[]> {
  if (items.length === 0) return []

  const tempTable = `temp_image_embedding_updates_${randomUUID().replaceAll('-', '')}`
  let updatedIds: string[] = []
  await using query = await beginTransaction()

  await query(
    `/* applyImageBatchUpdates */ CREATE TEMP TABLE ${tempTable} (
        entity_id TEXT NOT NULL,
        image_sha_256 BYTEA NOT NULL,
        embedding VECTOR(${EMBEDDING_DIMENSION}) NOT NULL
      ) ON COMMIT DROP`,
  )

  const copyStream = query.client.query(
    copyFrom(
      `COPY ${tempTable} (entity_id, image_sha_256, embedding) FROM STDIN WITH (FORMAT CSV)`,
    ),
  )
  await pipeline(Readable.from(generateImageCsvRows(items)), copyStream)

  // Pre-lock image rows in ascending id order BEFORE the embedding upsert so
  // that entity and embedding locks are acquired in a consistent order (entity then embedding).
  const imageEntityIds = items.map(item => item.entity_id)
  // ast-grep-ignore: no-three-sequential-awaits
  await query(
    `/* applyImageBatchUpdates lockRows */
      SELECT id FROM images
      WHERE id = ANY($1::uuid[])
      ORDER BY id
      FOR UPDATE`,
    [imageEntityIds],
  )

  await query(
    `/* applyImageBatchUpdates */ INSERT INTO ${IMAGE_EMBEDDINGS_TABLE} (image_sha_256, embedding)
      SELECT DISTINCT image_sha_256, embedding
      FROM ${tempTable}
      ORDER BY image_sha_256
      ON CONFLICT (image_sha_256) DO NOTHING`,
  )

  const { rows } = await write(
    `/* applyImageBatchUpdates */ UPDATE images
      SET bedrock_nova_multimodal_v1_embedding = u.embedding,
        bedrock_nova_multimodal_v1_embedding_created_at = NOW()
      FROM ${tempTable} u
      WHERE images.id = u.entity_id::uuid
        AND images.sha_256 = u.image_sha_256
      RETURNING images.id`,
    { query },
  )
  updatedIds = rows.map((r: { id: string }) => r.id)

  await query.commit()

  return updatedIds
}

async function* generateImageCsvRows(items: ImageBatchUpdateItem[]): AsyncGenerator<string> {
  for (const item of items) {
    yield `${csvEscape(item.entity_id)},\\x${item.image_sha_256.toString('hex')},"[${item.embedding.join(',')}]"\n`
  }
}
