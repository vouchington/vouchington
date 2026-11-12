import { beginTransaction, write } from '@data-stores/psql'
import { GEMINI_EMBEDDING_2_MODEL_ID } from '@services/embeddings/config'
import type { BatchJobType } from '@services/embeddings/batch/types'
import type { BatchMetadata } from './shared.mts'
import { insertLockRowsWithQuery } from './lock-rows.mts'

export function batchDocument(
  status: 'JOB_STATE_PENDING' | 'JOB_STATE_CANCELLING',
  inputGcsUri: string,
  outputGcsUri: string,
  metadata: BatchMetadata,
  jobName?: string,
  stopFailedAt?: string,
): Record<string, unknown> {
  return {
    state: status,
    jobName,
    inputGcsUri,
    manifestGcsUri: inputGcsUri.replace(/input\.jsonl$/, 'manifest.csv'),
    outputGcsUri,
    modelId: GEMINI_EMBEDDING_2_MODEL_ID,
    metadata,
    ...(stopFailedAt === undefined ? {} : { cleanup: { stopFailedAt } }),
  }
}

export async function markBatchSubmittedForPolling(
  batchId: string,
  jobName: string | undefined,
  data: Record<string, unknown>,
): Promise<void> {
  await write(
    `/* createBatch:markSubmitted */
    UPDATE gemini_embedding_batches
    SET job_name = $2,
        submitted_at = COALESCE(submitted_at, CURRENT_TIMESTAMP),
        data = $3
    WHERE id = $1
  `,
    [batchId, jobName || null, JSON.stringify(data)],
  )
}

export async function insertBatchAndLockRows(params: {
  batchId: string
  jobType: BatchJobType
  entityCount: number
  entityIdsFilePath: string
  data: Record<string, unknown>
  urlId: string | null
  crawlId: string | null
}): Promise<void> {
  await using query = await beginTransaction()

  await query(
    `/* createBatch:insertPreparing */
      INSERT INTO gemini_embedding_batches (
        id, job_name, model_id, job_type, data, url_id, crawl_id, records
      )
      VALUES ($1, NULL, $2, $3, $4, $5, $6, $7)`,
    [
      params.batchId,
      GEMINI_EMBEDDING_2_MODEL_ID,
      params.jobType,
      JSON.stringify(params.data),
      params.urlId,
      params.crawlId,
      params.entityCount,
    ],
  )
  await insertLockRowsWithQuery(query, params.batchId, params.jobType, params.entityIdsFilePath)

  await query.commit()
}
