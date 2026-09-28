import { createReadStream } from 'node:fs'
import { unlink } from 'node:fs/promises'
import { finished } from 'node:stream/promises'
import { CreateModelInvocationJobCommand } from '@aws-sdk/client-bedrock'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { beginTransaction, write } from '@data-stores/psql'
import { BedrockControlClient } from '@modules/aws/bedrock-control'
import { S3BedrockBatchBucket, S3BedrockBatchClient } from '@modules/aws/s3-bedrock-batch'
import onError from '@modules/on-error'
import { mintUUIDv7 } from '@modules/utils/ids'
import { BEDROCK_NOVA_MULTIMODAL_MODEL_ID } from '@services/bedrock-embeddings/config'
import type { BatchJobType } from '@services/bedrock-embeddings/batch/types'
import type { BatchMetadata } from './shared.mts'
import { cleanupBatchLocks, stopBedrockBatch } from './cleanup.mts'
import { insertLockRowsWithQuery } from './lock-rows.mts'
import { getBedrockBatchRoutingEnvironment } from './routing-environment.mts'
export const createBatch = async (
  filePath: string,
  jobType: BatchJobType,
  entityCount: number,
  entityIdsFilePath: string,
  metadata?: BatchMetadata,
): Promise<string> => {
  const batchId = mintUUIDv7()
  const inputKey = `bedrock-embeddings-input/${batchId}/input.jsonl`
  const outputPrefix = `bedrock-embeddings-output/${batchId}/`
  const inputS3Uri = `s3://${S3BedrockBatchBucket}/${inputKey}`
  const outputS3Uri = `s3://${S3BedrockBatchBucket}/${outputPrefix}`
  const batchMetadata = metadata || {}
  let submittedJobArn: string | undefined
  let batchPersisted = false
  try {
    const routingEnvironment = getBedrockBatchRoutingEnvironment()
    if (entityCount === 0) {
      throw new Error('Cannot create batch with no entities')
    }
    const createdAt = new Date()
    await insertBatchAndLockRows({
      batchId,
      jobType,
      entityCount,
      entityIdsFilePath,
      createdAt,
      inputS3Uri,
      outputS3Uri,
      inputSizeMb: batchMetadata.inputSizeMB ?? 0,
      urlId: batchMetadata.url_id ?? null,
      crawlId: batchMetadata.crawl_id ?? null,
    })
    batchPersisted = true
    await uploadBatchInput(filePath, inputKey)
    const job = await createBedrockBatchJob(batchId, inputS3Uri, outputS3Uri, routingEnvironment)
    submittedJobArn = job.jobArn
    await markBatchSubmittedForPolling(batchId, submittedJobArn)
  } catch (error) {
    let canReleaseLocks = !submittedJobArn
    if (submittedJobArn) {
      try {
        await stopBedrockBatch(submittedJobArn)
        canReleaseLocks = true
      } catch (stopError) {
        onError(stopError instanceof Error ? stopError : new Error(String(stopError)))
        await markBatchSubmittedForPolling(batchId, submittedJobArn, new Date()).catch(onError)
      }
    }
    if (canReleaseLocks && batchPersisted) {
      await cleanupBatchLocks(batchId).catch(onError)
      await write(
        `/* createBatch:cleanup */ DELETE FROM bedrock_embeddings_batches WHERE id = $1`,
        [batchId],
      ).catch(onError)
    }
    throw error
  } finally {
    await unlink(filePath).catch(onError)
    await unlink(entityIdsFilePath).catch(onError)
  }
  return batchId
}
async function markBatchSubmittedForPolling(
  batchId: string,
  jobArn: string | undefined,
  stopFailedAt: Date | null = null,
): Promise<void> {
  await write(
    `/* createBatch:markSubmitted */
    UPDATE bedrock_embeddings_batches
    SET job_arn = $2,
        submitted_at = COALESCE(submitted_at, CURRENT_TIMESTAMP),
        stop_failed_at = COALESCE($3, stop_failed_at)
    WHERE id = $1
  `,
    [batchId, jobArn || null, stopFailedAt],
  )
}
async function insertBatchAndLockRows(params: {
  batchId: string
  jobType: BatchJobType
  entityCount: number
  entityIdsFilePath: string
  createdAt: Date
  inputS3Uri: string
  outputS3Uri: string
  inputSizeMb: number
  urlId: string | null
  crawlId: string | null
}): Promise<void> {
  await using query = await beginTransaction()

  await query(
    `/* createBatch:insertPreparing */
      INSERT INTO bedrock_embeddings_batches (
        id, job_arn, model_id, job_type, input_s3_uri, output_s3_uri,
        input_size_mb, url_id, crawl_id, records, created_at
      )
      VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      params.batchId,
      BEDROCK_NOVA_MULTIMODAL_MODEL_ID,
      params.jobType,
      params.inputS3Uri,
      params.outputS3Uri,
      params.inputSizeMb,
      params.urlId,
      params.crawlId,
      params.entityCount,
      params.createdAt,
    ],
  )
  await insertLockRowsWithQuery(query, params.batchId, params.jobType, params.entityIdsFilePath)

  await query.commit()
}
/* no-mistakes: integration=bedrock */
async function uploadBatchInput(filePath: string, key: string): Promise<void> {
  const body = createReadStream(filePath)
  try {
    await S3BedrockBatchClient.send(
      new PutObjectCommand({
        Bucket: S3BedrockBatchBucket,
        Key: key,
        Body: body,
        ContentType: 'application/jsonl',
      }),
    )
  } finally {
    body.destroy()
    await finished(body).catch(onError)
  }
}

/* no-mistakes: integration=bedrock */
async function createBedrockBatchJob(
  batchId: string,
  inputS3Uri: string,
  outputS3Uri: string,
  routingEnvironment: ReturnType<typeof getBedrockBatchRoutingEnvironment>,
) {
  const roleArn = process.env.BEDROCK_BATCH_ROLE_ARN
  if (!roleArn) {
    throw new Error('Missing BEDROCK_BATCH_ROLE_ARN')
  }

  return await BedrockControlClient.send(
    new CreateModelInvocationJobCommand({
      jobName: `voucha-${routingEnvironment}-${batchId}`,
      modelId: BEDROCK_NOVA_MULTIMODAL_MODEL_ID,
      roleArn,
      inputDataConfig: {
        s3InputDataConfig: {
          s3Uri: inputS3Uri,
          s3InputFormat: 'JSONL',
        },
      },
      outputDataConfig: {
        s3OutputDataConfig: {
          s3Uri: outputS3Uri,
        },
      },
      timeoutDurationInHours: 168,
    }),
  )
}
