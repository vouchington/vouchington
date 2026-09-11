import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SqsMessage } from '@backend/worker-runtime'
import { bedrock_embeddings_batch } from '@queues/bedrock-embeddings-batch/queues'
import {
  cleanupTestEmbeddingsBatches,
  insertTestEmbeddingsBatch,
} from '@voucha/test-helpers/entities/bedrock-embeddings-batches'
import { processBedrockBatchSqsMessage } from '../processors.mts'

// This file intentionally exercises real glide-mq rather than mocking it; the passthrough only
// exists because the .real-glide.mock.test.mts filename (required for backend-real-glide-mq
// project routing) trips the no-mistakes mock-file-naming rule without a vi.mock call present.
vi.mock<typeof import('glide-mq')>(
  import('glide-mq'),
  async importOriginal => await importOriginal(),
)

function eventBridgeMessage(detail: Record<string, unknown>): SqsMessage {
  return {
    messageId: randomUUID(),
    receiptHandle: randomUUID(),
    body: JSON.stringify({ detail }),
  }
}

function isPollBatchJobFor(job: { name: string; data: unknown }, batchId: string): boolean {
  return job.name === 'poll_batch' && (job.data as { batch_id?: unknown }).batch_id === batchId
}

async function findAllPollBatchJobs() {
  // The 'polling' ordering group applies a real rate limit (config.mts), so a freshly enqueued
  // poll_batch job legitimately starts life in 'delayed' rather than 'waiting'. No worker runs
  // against this queue in the backend-real-glide-mq project, so a job never reaches 'active',
  // 'completed', or 'failed'.
  const [waiting, delayed] = await Promise.all([
    bedrock_embeddings_batch.getJobs('waiting'),
    bedrock_embeddings_batch.getJobs('delayed'),
  ])
  return [...waiting, ...delayed]
}

async function findPollBatchJobs(batchId: string) {
  const jobs = await findAllPollBatchJobs()
  return jobs.filter(job => isPollBatchJobFor(job, batchId))
}

describe('processBedrockBatchSqsMessage', () => {
  const createdBatchIds: string[] = []

  afterEach(async () => {
    const batchIds = createdBatchIds.splice(0)
    await cleanupTestEmbeddingsBatches(batchIds)
    // Remove only this test's own jobs by id, not the whole shared production queue: other
    // parallel test runs against the same isolated real-glide-mq Valkey prefix may have jobs in
    // flight, and obliterate() would delete those too.
    const jobs = await findAllPollBatchJobs()
    await Promise.all(
      jobs
        .filter(job => batchIds.some(batchId => isPollBatchJobFor(job, batchId)))
        .map(job => job.remove()),
    )
  })

  it('enqueues a poll_batch job for the batch matching detail.jobArn', async () => {
    const batchId = randomUUID()
    createdBatchIds.push(batchId)
    const jobArn = `arn:aws:bedrock:us-west-2:123:model-invocation-job/${batchId}`
    await insertTestEmbeddingsBatch({ id: batchId, bedrockStatus: 'Submitted', jobArn })

    await processBedrockBatchSqsMessage(eventBridgeMessage({ jobArn }))

    const jobs = await findPollBatchJobs(batchId)
    expect(jobs).toHaveLength(1)
    expect(jobs[0]?.data).toEqual({ batch_id: batchId })
  })

  it('accepts detail.batchJobArn as a fallback for jobArn', async () => {
    const batchId = randomUUID()
    createdBatchIds.push(batchId)
    const jobArn = `arn:aws:bedrock:us-west-2:123:model-invocation-job/${batchId}`
    await insertTestEmbeddingsBatch({ id: batchId, bedrockStatus: 'Submitted', jobArn })

    await processBedrockBatchSqsMessage(eventBridgeMessage({ batchJobArn: jobArn }))

    const jobs = await findPollBatchJobs(batchId)
    expect(jobs).toHaveLength(1)
  })

  it('deduplicates redelivery of the same message so only one poll_batch job lands', async () => {
    const batchId = randomUUID()
    createdBatchIds.push(batchId)
    const jobArn = `arn:aws:bedrock:us-west-2:123:model-invocation-job/${batchId}`
    await insertTestEmbeddingsBatch({ id: batchId, bedrockStatus: 'Submitted', jobArn })
    const message = eventBridgeMessage({ jobArn })

    // SQS is at-least-once; simulate the same message being delivered twice.
    await processBedrockBatchSqsMessage(message)
    await processBedrockBatchSqsMessage(message)

    const jobs = await findPollBatchJobs(batchId)
    expect(jobs).toHaveLength(1)
  })

  it('throws when the EventBridge event is missing jobArn in detail', async () => {
    await expect(processBedrockBatchSqsMessage(eventBridgeMessage({}))).rejects.toThrow(
      'EventBridge event missing jobArn in detail',
    )
  })

  it('throws when message.body is not valid JSON', async () => {
    const message: SqsMessage = {
      messageId: randomUUID(),
      receiptHandle: randomUUID(),
      body: 'not json',
    }

    await expect(processBedrockBatchSqsMessage(message)).rejects.toThrow(SyntaxError)
  })

  it('throws when no batch matches the jobArn, so redelivery exhausts into the DLQ', async () => {
    const jobArn = `arn:aws:bedrock:us-west-2:123:model-invocation-job/${randomUUID()}`

    await expect(processBedrockBatchSqsMessage(eventBridgeMessage({ jobArn }))).rejects.toThrow(
      `Batch not found for jobArn: ${jobArn}`,
    )
  })
})
