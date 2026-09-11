/**
 * Bedrock embeddings batches entity helpers
 */

import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  deriveBedrockBatchStatus,
  lifecycleColumnForBedrockStatus,
  type BedrockBatchStatus,
} from './_bedrock-batch-status-support.mts'

/**
 * Insert a test embeddings batch with flexible parameters
 */
export async function insertTestEmbeddingsBatch(data: {
  id: string
  model?: string
  jobType?: string
  jobArn?: string | null
  bedrockStatus?: string
  batchData?: unknown
  records?: number
  completedAt?: Date | null
  createdAt?: Date
  submittedAt?: Date | null
  inProgressAt?: Date | null
}): Promise<void> {
  const model = data.model || 'amazon.nova-2-multimodal-embeddings-v1:0'
  const jobType = data.jobType || 'topics'
  const bedrockStatus = data.bedrockStatus || 'Submitted'
  const batchData = {
    status: bedrockStatus,
    ...((data.batchData ?? {}) as Record<string, unknown>),
  }
  const records = data.records || 0

  const column = lifecycleColumnForBedrockStatus(bedrockStatus)
  const now = new Date()

  // Reflect real lifecycle progression: later states imply earlier states were set first.
  const hasPastSubmitted =
    column === 'submitted_at' ||
    column === 'in_progress_at' ||
    column === 'completed_at' ||
    column === 'failed_at' ||
    column === 'cancelled_at'
  const hasPastInProgress = column === 'in_progress_at' || column === 'completed_at'

  const submitted_at =
    data.submittedAt !== undefined ? data.submittedAt : hasPastSubmitted ? now : null
  const in_progress_at =
    data.inProgressAt !== undefined ? data.inProgressAt : hasPastInProgress ? now : null
  const completed_at =
    data.completedAt !== undefined ? data.completedAt : column === 'completed_at' ? now : null
  const failed_at = column === 'failed_at' ? now : null
  const cancelled_at = column === 'cancelled_at' ? now : null

  const job_arn = data.jobArn !== undefined ? data.jobArn : null

  await write(sql`
    INSERT INTO bedrock_embeddings_batches
      (id, model_id, job_type, job_arn, data, records, submitted_at, in_progress_at, completed_at, failed_at, cancelled_at, created_at)
    VALUES (
      ${data.id},
      ${model},
      ${jobType},
      ${job_arn},
      ${JSON.stringify(batchData)},
      ${records},
      ${submitted_at},
      ${in_progress_at},
      ${completed_at},
      ${failed_at},
      ${cancelled_at},
      ${data.createdAt ?? now}
    )
  `)
}

export async function cleanupTestEmbeddingsBatchesByPrefix(prefix: string): Promise<void> {
  await write(sql`
    DELETE FROM bedrock_embeddings_batches
    WHERE id LIKE ${`${prefix}%`}
  `)
}

export async function cleanupTestEmbeddingsBatches(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  await write(
    `/* cleanupTestEmbeddingsBatches */
    DELETE FROM bedrock_embeddings_batches
    WHERE id = ANY($1)`,
    [ids],
  )
}

export async function getTestBatchTerminalTimestamps(batchId: string): Promise<{
  completed_at: Date | null
  failed_at: Date | null
  cancelled_at: Date | null
} | null> {
  const { rows } = await read<{
    completed_at: Date | null
    failed_at: Date | null
    cancelled_at: Date | null
  }>(sql`
    /* getTestBatchTerminalTimestamps */
    SELECT completed_at, failed_at, cancelled_at
    FROM bedrock_embeddings_batches
    WHERE id = ${batchId}
  `)
  return rows[0] ?? null
}

export async function getTestBatchEntities(
  batchId: string,
): Promise<Array<{ entity_id: string; entity_type: string }>> {
  const { rows } = await read(sql`
    SELECT
      entity_type::text AS entity_type,
      CASE entity_type
        WHEN 'topics' THEN topic_id::text
        WHEN 'posts' THEN post_id::text
        WHEN 'rss_feed_items' THEN rss_feed_item_id::text
        WHEN 'crawl_chunks' THEN crawl_id::text || '-' || crawl_order_index::text
        WHEN 'images' THEN image_id::text
      END AS entity_id
    FROM bedrock_embeddings_batch_entities
    WHERE batch_id = ${batchId}
    ORDER BY entity_id
  `)
  return rows.map(row => ({
    entity_id: String(row.entity_id),
    entity_type: String(row.entity_type),
  }))
}

export async function getTestBatchSummary(
  batchId: string,
): Promise<{ job_type: string; status: BedrockBatchStatus } | null> {
  const { rows } = await read(sql`
    SELECT
      job_type::text AS job_type,
      submitted_at,
      in_progress_at,
      completed_at,
      failed_at,
      cancelled_at
    FROM bedrock_embeddings_batches
    WHERE id = ${batchId}
  `)
  const row = rows[0]
  if (!row) return null
  const status = deriveBedrockBatchStatus({
    submitted_at: row.submitted_at as Date | null,
    in_progress_at: row.in_progress_at as Date | null,
    completed_at: row.completed_at as Date | null,
    failed_at: row.failed_at as Date | null,
    cancelled_at: row.cancelled_at as Date | null,
  })
  return { job_type: String(row.job_type), status }
}
