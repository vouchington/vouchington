import { GetModelInvocationJobCommand } from '@aws-sdk/client-bedrock'
import { read, write } from '@data-stores/psql'
import { BedrockControlClient } from '@modules/aws/bedrock-control'
import { lifecycleColumnForBedrockStatus } from '../derive-status.mts'
import { cleanupBatchLocks } from './cleanup.mts'

export const processBatch = async (batchId: string): Promise<void> => {
  const { rows: batchRows } = await read(
    `/* processBatch */
    SELECT id, job_arn, completed_at, failed_at, cancelled_at
    FROM bedrock_embeddings_batches
    WHERE id = $1
  `,
    [batchId],
  )

  if (batchRows.length === 0) {
    throw new Error(`Batch not found: ${batchId}`)
  }

  const persistedBatch = batchRows[0]
  if (persistedBatch.completed_at !== null) {
    return
  }
  if (persistedBatch.failed_at !== null || persistedBatch.cancelled_at !== null) {
    await cleanupBatchLocks(batchId)
    return
  }

  const batch = await retrieveBedrockBatch(persistedBatch.job_arn)
  const status = batch.status || 'Submitted'
  // Treat unrecognised statuses as failed to prevent indefinite polling
  const column = lifecycleColumnForBedrockStatus(status) ?? 'failed_at'

  const transition = await write(
    `/* processBatch */
    UPDATE bedrock_embeddings_batches
    SET data = data || $2::jsonb,
        ${column} = COALESCE(${column}, CURRENT_TIMESTAMP)
    WHERE id = $1
      AND completed_at IS NULL
      AND failed_at IS NULL
      AND cancelled_at IS NULL
  `,
    [batchId, JSON.stringify(batch)],
  )

  if ((transition.rowCount ?? 0) > 0 && (column === 'failed_at' || column === 'cancelled_at')) {
    await cleanupBatchLocks(batchId)
  }
}

/* no-mistakes: integration=bedrock */
export async function retrieveBedrockBatch(jobArn: string) {
  return await BedrockControlClient.send(
    new GetModelInvocationJobCommand({
      jobIdentifier: jobArn,
    }),
  )
}
