import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { Job, Worker } from 'glide-mq'
import { processBedrockEmbeddingsBatchJob } from '../processors/worker-router.mts'
import { bedrockEmbeddingsBatchConfig } from '@services/bedrock-embeddings/batch/config'
import {
  overrideDynamicConfigFieldsForTest,
  closeScopedDynamicConfigContext,
} from '@voucha/test-helpers/dynamic-config'
import {
  cleanupTestEmbeddingsBatches,
  insertTestEmbeddingsBatch,
} from '@voucha/test-helpers/entities/bedrock-embeddings-batches'

const createdBatchIds: string[] = []

describe('bedrock embeddings batch worker processor', () => {
  beforeAll(async () => {
    await bedrockEmbeddingsBatchConfig.waitForInitialization()
    bedrockEmbeddingsBatchConfig.unsubscribe()
  })

  afterEach(async () => {
    overrideDynamicConfigFieldsForTest(bedrockEmbeddingsBatchConfig, {
      max_inflight_jobs: 100,
      max_requests_per_hour: 100000,
      max_requests_per_file: 100000,
      max_file_size_gb: 1,
      max_job_size_gb: 100,
      min_records_per_job: 100,
      backlog_threshold: 1000,
      stale_ttl_hours: 24,
    })
    await cleanupTestEmbeddingsBatches(createdBatchIds.splice(0))
  })

  afterAll(async () => {
    await closeScopedDynamicConfigContext([bedrockEmbeddingsBatchConfig])
  })

  it.each([['topics'], ['posts'], ['rss_feed_items'], ['crawl_chunks'], ['images']] as const)(
    'routes %s creation jobs through the real batch processors',
    async name => {
      await blockBatchCreation()

      await expect(
        processBedrockEmbeddingsBatchJob(makeJob(name, {}, 'creation'), {} as Worker),
      ).resolves.toEqual({ reEnqueued: true, reason: 'inflight_job_limit_exceeded' })
    },
  )

  it('runs the creation dispatcher branch through the real queue enqueues', async () => {
    await expect(
      processBedrockEmbeddingsBatchJob(
        makeJob('creation_dispatcher', {}, 'dispatcher'),
        {} as Worker,
      ),
    ).resolves.toEqual({ batchesEnqueued: 5 })
  })

  it('routes polling and dispatcher jobs through the real processors', async () => {
    await expect(
      processBedrockEmbeddingsBatchJob(
        makeJob('poll_batch', { batch_id: crypto.randomUUID() }, 'polling'),
        {} as Worker,
      ),
    ).rejects.toThrow('Batch not found')

    await expect(
      processBedrockEmbeddingsBatchJob(makeJob('poll_dispatcher', {}, 'dispatcher'), {} as Worker),
    ).resolves.toEqual({ count: expect.any(Number) })

    await expect(
      processBedrockEmbeddingsBatchJob(
        makeJob('backlog_dispatcher', {}, 'dispatcher'),
        {} as Worker,
      ),
    ).resolves.toMatchObject({ triggered: expect.any(Boolean) })

    await expect(
      processBedrockEmbeddingsBatchJob(
        makeJob('stale_cleanup_dispatcher', {}, 'dispatcher'),
        {} as Worker,
      ),
    ).resolves.toEqual(expect.objectContaining({ inspected: expect.any(Number) }))
  })

  it('rejects malformed and unknown jobs through the retry handler', async () => {
    await expect(
      processBedrockEmbeddingsBatchJob(makeJob('poll_batch', {}, 'polling'), {} as Worker),
    ).rejects.toThrow('Batch ID is required')

    await expect(
      processBedrockEmbeddingsBatchJob(makeJob('unexpected', {}, 'creation'), {} as Worker),
    ).rejects.toThrow('Unknown creation job type: unexpected')

    await expect(
      processBedrockEmbeddingsBatchJob(makeJob('unexpected', {}, 'polling'), {} as Worker),
    ).rejects.toThrow('Unknown polling job type: unexpected')

    await expect(
      processBedrockEmbeddingsBatchJob(makeJob('unexpected', {}, 'dispatcher'), {} as Worker),
    ).rejects.toThrow('Unknown dispatcher job type: unexpected')

    await expect(
      processBedrockEmbeddingsBatchJob(makeJob('unexpected', {}, 'unknown'), {} as Worker),
    ).rejects.toThrow('Unknown ordering key: unknown')
  })
})

function makeJob(
  name: string,
  data: Record<string, unknown>,
  orderingKey: string,
): Job<Record<string, unknown>> {
  return { data, name, opts: { ordering: { key: orderingKey } } } as Job<Record<string, unknown>>
}

async function blockBatchCreation(): Promise<void> {
  overrideDynamicConfigFieldsForTest(bedrockEmbeddingsBatchConfig, { max_inflight_jobs: 1 })
  const id = crypto.randomUUID()
  createdBatchIds.push(id)
  await insertTestEmbeddingsBatch({
    id,
    jobType: 'posts',
    bedrockStatus: 'Submitted',
  })
}
