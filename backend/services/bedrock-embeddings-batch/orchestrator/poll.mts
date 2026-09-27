import { GetModelInvocationJobCommand } from '@aws-sdk/client-bedrock'
import { read, write } from '@data-stores/psql'
import { BedrockControlClient } from '@modules/aws/bedrock-control'
import { lifecycleColumnForBedrockStatus } from '../derive-status.mts'
import { cleanupBatchLocks } from './cleanup.mts'

export type ProcessBatchOutcome = {
  bedrockStatus: string
  jobType: string
}

export const processBatch = async (batchId: string): Promise<ProcessBatchOutcome> => {
  const { rows: batchRows } = await read(
    `/* processBatch */
    SELECT id, job_arn, job_type, completed_at, failed_at, cancelled_at
    FROM bedrock_embeddings_batches
    WHERE id = $1
  `,
    [batchId],
  )

  if (batchRows.length === 0) {
    throw new Error(`Batch not found: ${batchId}`)
  }

  const persistedBatch = batchRows[0]
  const jobType = String(persistedBatch.job_type)
  if (persistedBatch.completed_at !== null) {
    return { bedrockStatus: 'Completed', jobType }
  }
  if (persistedBatch.failed_at !== null || persistedBatch.cancelled_at !== null) {
    await cleanupBatchLocks(batchId)
    return {
      bedrockStatus: persistedBatch.cancelled_at !== null ? 'Stopped' : 'Failed',
      jobType,
    }
  }

  const batch = await retrieveBedrockBatch(persistedBatch.job_arn)
  const status = batch.status || 'Submitted'
  // Treat unrecognised statuses as failed to prevent indefinite polling
  const column = lifecycleColumnForBedrockStatus(status) ?? 'failed_at'

  const transition = await write(
    `/* processBatch */
    UPDATE bedrock_embeddings_batches
    SET ${column} = COALESCE(${column}, CURRENT_TIMESTAMP)
    WHERE id = $1
      AND completed_at IS NULL
      AND failed_at IS NULL
      AND cancelled_at IS NULL
  `,
    [batchId],
  )

  if ((transition.rowCount ?? 0) > 0 && (column === 'failed_at' || column === 'cancelled_at')) {
    await cleanupBatchLocks(batchId)
  }
  return { bedrockStatus: status, jobType }
}

/* no-mistakes: integration=bedrock */
export async function retrieveBedrockBatch(jobArn: string) {
  return await BedrockControlClient.send(
    new GetModelInvocationJobCommand({
      jobIdentifier: jobArn,
    }),
  )
}
