import { read, write } from '@data-stores/psql'
import { mintUUIDv7 } from '@modules/utils/ids'

/**
 * Creates a test batch record with batch entities
 * Returns the batch ID for cleanup
 */
export const createTestBatch = async (
  options: {
    entityIds?: string[]
    jobType?: string
    records?: number
  } = {},
) => {
  const batchId = mintUUIDv7()
  const jobType = options.jobType || 'topics'
  const records = options.records || options.entityIds?.length || 0
  const entityIds = options.entityIds || []

  // Create the batch first
  await write(
    `/* createTestBatch */
    INSERT INTO bedrock_embedding_batches (id, model_id, job_type, data, records, submitted_at)
    VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
  `,
    [
      batchId,
      'amazon.nova-2-multimodal-embeddings-v1:0',
      jobType,
      JSON.stringify({ status: 'Submitted' }),
      records,
    ],
  )

  // Insert batch entities if provided
  if (entityIds.length > 0) {
    // Materialize IDs after the batch write, before the entity query waits for a connection.
    const values = [...entityIds]
    await write(
      `/* createTestBatch:entities */
      WITH entity_ids (batch_id, entity_type, entity_id, input_order) AS (
        SELECT $1::uuid, $2::text, entity_id, input_order
        FROM UNNEST($3::text[]) WITH ORDINALITY AS input(entity_id, input_order)
      )
      INSERT INTO bedrock_embedding_batch_entities (
        batch_id,
        entity_type,
        topic_id,
        post_id,
        rss_feed_item_id,
        crawl_id,
        crawl_order_index,
        image_id
      )
      SELECT
        batch_id::uuid,
        entity_type::bedrock_embedding_batch_job_types,
        CASE WHEN entity_type = 'topics' THEN entity_id::uuid ELSE NULL END,
        CASE WHEN entity_type = 'posts' THEN entity_id::uuid ELSE NULL END,
        CASE WHEN entity_type = 'rss_feed_items' THEN entity_id::uuid ELSE NULL END,
        CASE WHEN entity_type = 'crawl_chunks' THEN regexp_replace(entity_id, '-[0-9]+$', '')::uuid ELSE NULL END,
        CASE WHEN entity_type = 'crawl_chunks' THEN substring(entity_id from '-([0-9]+)$')::int ELSE NULL END,
        CASE WHEN entity_type = 'images' THEN entity_id::uuid ELSE NULL END
      FROM entity_ids
      ORDER BY input_order
    `,
      [batchId, jobType, values],
    )
  }

  return { batchId }
}

/**
 * Counts batch entities for a given batch ID
 */
export const countBatchEntities = async (batchId: string): Promise<number> => {
  const { rows } = await read(
    `/* countBatchEntities */
    SELECT COUNT(*)::int as count
    FROM bedrock_embedding_batch_entities
    WHERE batch_id = $1
  `,
    [batchId],
  )
  return rows[0].count
}
