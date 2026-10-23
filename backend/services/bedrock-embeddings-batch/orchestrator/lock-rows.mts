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

  // no-mistakes-disable-next-line postgres-required-predicates: COPY FROM STDIN transports bound batch data into a temporary staging table; it is not a guarded-relation read
  const copyStream = query.client.query(
    copyFrom(`COPY ${tempTable} (entity_id) FROM STDIN WITH (FORMAT CSV)`),
  )
  await pipeline(createReadStream(entityIdsFilePath), copyStream)

  if (entityType === 'topics') {
    // The provider input file already contains these ids. Reject the whole batch if even one
    // topic is inactive, rather than submitting paid work for a row omitted from the lock table.
    // Keep the row locks until this transaction commits so a concurrent merge cannot win the check.
    const { rows } = await query<{ candidate_count: number; active_count: number }>(
      `/* insertLockRows:activeTopics */
       WITH candidates AS MATERIALIZED (
         SELECT DISTINCT entity_id::uuid AS id FROM ${tempTable}
       ), active_topics AS MATERIALIZED (
         SELECT topic.id FROM topics topic
         JOIN candidates candidate ON candidate.id = topic.id
         WHERE topic.deleted_at IS NULL AND topic.merged_into_topic_id IS NULL
         ORDER BY topic.id FOR SHARE OF topic
       )
       SELECT (SELECT count(*)::int FROM candidates) AS candidate_count,
         (SELECT count(*)::int FROM active_topics) AS active_count`,
    )
    if (rows[0]?.candidate_count !== rows[0]?.active_count)
      throw new Error('Cannot create a topic embedding batch with an inactive topic')
  }

  await query(
    `/* insertLockRows */ INSERT INTO bedrock_embedding_batch_entities (
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
      $1::uuid,
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
