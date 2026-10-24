import { mintUUIDv7 } from '@modules/utils/ids'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  cleanupTestEmbeddingsBatches,
  insertTestEmbeddingsBatch,
} from '@voucha/test-helpers/entities/bedrock-embeddings-batches'
import { withEmbeddingQuotaSnapshot } from '@voucha/test-helpers/embedding-quota-snapshot'
import type { QueryOptions } from '@data-stores/psql/types'
import {
  overrideDynamicConfigFieldsForTest,
  closeScopedDynamicConfigContext,
} from '@voucha/test-helpers/dynamic-config'
import {
  bedrockEmbeddingsBatchConfig,
  getRateLimitConfig,
} from '@services/bedrock-embeddings/batch/config'
import {
  getActiveBatchStats,
  getBatchRecordsCreatedInLastHour,
} from '@services/bedrock-embeddings/batch/orchestrator/poll-queries'
import { getBatchCreationLimits } from './rate-limits.mts'

const createdBatchIds: string[] = []

describe('getBatchCreationLimits', () => {
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

  it('allows a batch within the configured request and size budgets', async () => {
    const referenceTime = new Date()
    overrideDynamicConfigFieldsForTest(bedrockEmbeddingsBatchConfig, {
      max_inflight_jobs: 1000000,
      max_requests_per_hour: 1000000000,
      max_requests_per_file: 200,
      max_file_size_gb: 1,
      max_job_size_gb: 100000,
      min_records_per_job: 100,
    })
    await insertBatch({ bedrockStatus: 'Submitted', records: 850, inputSizeMB: 256 })
    await insertBatch({ bedrockStatus: 'Completed', records: 25, inputSizeMB: 512 })

    await expect(getBatchCreationLimits(referenceTime)).resolves.toEqual({
      allowed: true,
      maxRecords: 200,
      maxSizeMB: 1024,
      minRecords: 100,
    })
  })

  it('blocks when the in-flight job limit is reached', async () => {
    const referenceTime = new Date()
    await withEmbeddingQuotaSnapshot(async query => {
      const activeBefore = await getActiveBatchStats({ query })
      const hourlyBefore = await getBatchRecordsCreatedInLastHour(referenceTime, { query })
      overrideDynamicConfigFieldsForTest(bedrockEmbeddingsBatchConfig, {
        max_inflight_jobs: activeBefore.count + 1,
        max_requests_per_hour: hourlyBefore + 1,
        max_job_size_gb: Math.floor(activeBefore.inputSizeMB / 1024) + 1,
      })
      await expect(getBatchCreationLimits(referenceTime, { query })).resolves.toMatchObject({
        allowed: true,
      })
      await insertBatch({ bedrockStatus: 'Submitted' }, { query })

      await expect(getBatchCreationLimits(referenceTime, { query })).resolves.toEqual({
        allowed: false,
        reason: 'inflight_job_limit_exceeded',
      })
    })
  })

  it('blocks when the hourly request limit is exhausted', async () => {
    const referenceTime = new Date()
    await withEmbeddingQuotaSnapshot(async query => {
      const activeBefore = await getActiveBatchStats({ query })
      const hourlyBefore = await getBatchRecordsCreatedInLastHour(referenceTime, { query })
      overrideDynamicConfigFieldsForTest(bedrockEmbeddingsBatchConfig, {
        max_inflight_jobs: activeBefore.count + 1,
        max_requests_per_hour: hourlyBefore + 1,
        max_job_size_gb: Math.floor(activeBefore.inputSizeMB / 1024) + 1,
      })
      await expect(getBatchCreationLimits(referenceTime, { query })).resolves.toMatchObject({
        allowed: true,
      })
      await insertBatch({ bedrockStatus: 'Completed', records: 1 }, { query })

      await expect(getBatchCreationLimits(referenceTime, { query })).resolves.toEqual({
        allowed: false,
        reason: 'hourly_request_limit_exceeded',
      })
    })
  })

  it('blocks when active batches have exhausted the input-size budget', async () => {
    const referenceTime = new Date()
    await withEmbeddingQuotaSnapshot(async query => {
      const activeBefore = await getActiveBatchStats({ query })
      const hourlyBefore = await getBatchRecordsCreatedInLastHour(referenceTime, { query })
      const maxJobSizeGB = Math.floor(activeBefore.inputSizeMB / 1024) + 1
      const maxInflightSizeMB = maxJobSizeGB * 1024
      const inputSizeMB = maxInflightSizeMB - activeBefore.inputSizeMB + 1
      overrideDynamicConfigFieldsForTest(bedrockEmbeddingsBatchConfig, {
        max_inflight_jobs: activeBefore.count + 2,
        max_requests_per_hour: hourlyBefore + 1,
        max_job_size_gb: maxJobSizeGB,
      })
      await expect(getBatchCreationLimits(referenceTime, { query })).resolves.toMatchObject({
        allowed: true,
      })
      await insertBatch({ bedrockStatus: 'Submitted', inputSizeMB }, { query })

      await expect(getBatchCreationLimits(referenceTime, { query })).resolves.toEqual({
        allowed: false,
        reason: 'inflight_size_limit_exceeded',
      })
    })
  })

  it('falls back to defaults when quota fields are zero or negative', async () => {
    overrideDynamicConfigFieldsForTest(bedrockEmbeddingsBatchConfig, {
      max_inflight_jobs: 0,
      max_requests_per_hour: -1,
      max_requests_per_file: 0,
      max_file_size_gb: -5,
      max_job_size_gb: 0,
      min_records_per_job: -10,
    })

    expect(getRateLimitConfig()).toEqual({
      MAX_INFLIGHT_JOBS: 100,
      MAX_REQUESTS_PER_HOUR: 100000,
      MAX_REQUESTS_PER_BATCH: 100000,
      MAX_BATCH_SIZE_MB: 1024,
      MAX_INFLIGHT_SIZE_MB: 102400,
      MIN_RECORDS_PER_JOB: 100,
    })
  })
})

async function insertBatch(
  options: {
    bedrockStatus: string
    records?: number
    inputSizeMB?: number
  },
  queryOptions: QueryOptions = {},
): Promise<void> {
  const id = mintUUIDv7()
  createdBatchIds.push(id)
  await insertTestEmbeddingsBatch(
    {
      id,
      jobType: 'posts',
      bedrockStatus: options.bedrockStatus,
      batchData: { metadata: { inputSizeMB: options.inputSizeMB ?? 0 } },
      records: options.records ?? 0,
    },
    queryOptions,
  )
}
