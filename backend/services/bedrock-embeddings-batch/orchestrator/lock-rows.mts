import { randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import type { TransactionQuery } from '@data-stores/psql/types'
import { from as copyFrom } from 'pg-copy-streams'
import type { BatchJobType } from '@services/bedrock-embeddings/batch/types'

export async function insertLockRowsWithQuery(
  query: TransactionQuery,
  batchId: string,
  entityType: BatchJobType,
  entityIdsFilePath: string,
): Promise<void> {
  const tempTable = `temp_batch_entities_${randomUUID().replaceAll('-', '')}`
  await query(
    `/* insertLockRows */ CREATE TEMP TABLE ${tempTable} (
      entity_id TEXT NOT NULL
    ) ON COMMIT DROP`,
  )

  const copyStream = query.client.query(
    copyFrom(`COPY ${tempTable} (entity_id) FROM STDIN WITH (FORMAT CSV)`),
  )
  await pipeline(createReadStream(entityIdsFilePath), copyStream)

  await query(
    `/* insertLockRows */ INSERT INTO bedrock_embeddings_batch_entities (
      batch_id,
      entity_type,
      topic_id,
      post_id,
      rss_feed_item_id,
      crawl_id,
      crawl_order_index,
      image_id
    )
    SELECT DISTINCT
      $1,
      $2::bedrock_embedding_batch_job_types,
      CASE WHEN $2 = 'topics' THEN entity_id::uuid ELSE NULL END,
      CASE WHEN $2 = 'posts' THEN entity_id::uuid ELSE NULL END,
      CASE WHEN $2 = 'rss_feed_items' THEN entity_id::uuid ELSE NULL END,
      CASE WHEN $2 = 'crawl_chunks' THEN regexp_replace(entity_id, '-[0-9]+$', '')::uuid ELSE NULL END,
      CASE WHEN $2 = 'crawl_chunks' THEN substring(entity_id from '-([0-9]+)$')::int ELSE NULL END,
      CASE WHEN $2 = 'images' THEN entity_id::uuid ELSE NULL END
    FROM ${tempTable}`,
    [batchId, entityType],
  )
}
