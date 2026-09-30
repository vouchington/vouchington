import { beginTransaction, write } from '@data-stores/psql'
import { BEDROCK_NOVA_MULTIMODAL_MODEL_ID } from '@services/bedrock-embeddings/config'
import type { BatchJobType } from '@services/bedrock-embeddings/batch/types'
import type { BatchMetadata } from './shared.mts'
import { insertLockRowsWithQuery } from './lock-rows.mts'

export function batchDocument(
  status: 'Preparing' | 'Submitted',
  inputS3Uri: string,
  outputS3Uri: string,
  metadata: BatchMetadata,
  jobArn?: string,
  stopFailedAt?: string,
): Record<string, unknown> {
  return {
    status,
    jobArn,
    inputS3Uri,
    outputS3Uri,
    modelId: BEDROCK_NOVA_MULTIMODAL_MODEL_ID,
    metadata,
    ...(stopFailedAt === undefined ? {} : { cleanup: { stopFailedAt } }),
  }
}

export async function markBatchSubmittedForPolling(
  batchId: string,
  jobArn: string | undefined,
  data: Record<string, unknown>,
): Promise<void> {
  await write(
    `/* createBatch:markSubmitted */
    UPDATE bedrock_embeddings_batches
    SET job_arn = $2,
        submitted_at = COALESCE(submitted_at, CURRENT_TIMESTAMP),
        data = $3
    WHERE id = $1
  `,
    [batchId, jobArn || null, JSON.stringify(data)],
  )
}

export async function insertBatchAndLockRows(params: {
  batchId: string
  jobType: BatchJobType
  entityCount: number
  entityIdsFilePath: string
  createdAt: Date
  data: Record<string, unknown>
  urlId: string | null
  crawlId: string | null
}): Promise<void> {
  await using query = await beginTransaction()

  await query(
    `/* createBatch:insertPreparing */
      INSERT INTO bedrock_embeddings_batches (
        id, job_arn, model_id, job_type, data, url_id, crawl_id, records, created_at
      )
      VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8)`,
    [
      params.batchId,
      BEDROCK_NOVA_MULTIMODAL_MODEL_ID,
      params.jobType,
      JSON.stringify(params.data),
      params.urlId,
      params.crawlId,
      params.entityCount,
      params.createdAt,
    ],
  )
  await insertLockRowsWithQuery(query, params.batchId, params.jobType, params.entityIdsFilePath)

  await query.commit()
}
