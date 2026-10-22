import { mintUUIDv7 } from '@modules/utils/ids'
import { expect } from 'vitest'
import { read } from '@data-stores/psql'
import { allowUnannotatedQuery } from '@data-stores/psql/prepared-statement-name'
import {
  bedrockEmbeddingsBatchConfig,
  getRateLimitConfig,
} from '../services/bedrock-embeddings/batch/config.mts'
import {
  minimumImageBatchSizeMB,
  minimumTextBatchSizeMB,
} from '../services/bedrock-embeddings/batch/input-size-limits.mts'
import { getBatchCreationLimits } from '../services/bedrock-embeddings-batch/rate-limits.mts'
import {
  getActiveBatchStats,
  getBatchRecordsCreatedInLastHour,
} from '../services/bedrock-embeddings/batch/orchestrator/poll-queries.mts'
import type { BatchJobType } from '../services/bedrock-embeddings/batch/types.mts'
import type { acquireEmbeddingQuotaFixture } from './embedding-creation-quota.mts'
import { overrideDynamicConfigFieldsForTest } from './dynamic-config.mts'
import {
  cleanupTestEmbeddingsBatches,
  insertTestEmbeddingsBatch,
} from './entities/bedrock-embeddings-batches.mts'

const inputSizeMB = 17
const records = 1

/** Adds separate retained stock so quota tests exercise unfiltered global accounting. */
export async function createRetainedEmbeddingBatchStock(
  quota: Awaited<ReturnType<typeof acquireEmbeddingQuotaFixture>>,
  referenceTime: Date,
) {
  const id = mintUUIDv7()
  let inserted = false

  quota.beforeLeaseRelease(async () => {
    if (!inserted) return
    await quota.assertLeaseHeld()
    await assertPresent()
    await cleanupTestEmbeddingsBatches([id])
    const { rows } = await read<{ id: string }>(
      allowUnannotatedQuery('SELECT id FROM bedrock_embedding_batches WHERE id = $1'),
      [id],
    )
    expect(rows).toEqual([])
  })

  const baseline = await quota.trackOperation(async () => {
    const activeBefore = await getActiveBatchStats()
    const hourlyBefore = await getBatchRecordsCreatedInLastHour(referenceTime)
    await insertTestEmbeddingsBatch({
      id,
      bedrockStatus: 'Submitted',
      records,
      batchData: { metadata: { inputSizeMB } },
    })
    inserted = true
    const active = await getActiveBatchStats()
    const hourlyRecords = await getBatchRecordsCreatedInLastHour(referenceTime)
    expect(active).toEqual({
      count: activeBefore.count + 1,
      inputSizeMB: activeBefore.inputSizeMB + inputSizeMB,
    })
    expect(hourlyRecords).toBe(hourlyBefore + records)
    return { active, hourlyRecords }
  })

  return {
    id,
    inputSizeMB,
    records,
    referenceTime,
    baseline: baseline.active,
    hourlyRecords: baseline.hourlyRecords,
    assertPresent,
  }

  async function assertPresent() {
    if (!inserted) throw new Error('Retained embedding stock was not inserted')
    const { rows } = await read<{ id: string; records: number; input_size_mb: number }>(
      allowUnannotatedQuery(`SELECT id, records,
        (data->'metadata'->>'inputSizeMB')::DOUBLE PRECISION AS input_size_mb
      FROM bedrock_embedding_batches
      WHERE id = $1 AND submitted_at IS NOT NULL AND completed_at IS NULL
        AND failed_at IS NULL AND cancelled_at IS NULL`),
      [id],
    )
    expect(rows).toEqual([{ id, records, input_size_mb: inputSizeMB }])
  }
}

export async function assertRetainedEmbeddingBatchStockRemains(
  stock: Awaited<ReturnType<typeof createRetainedEmbeddingBatchStock>>,
) {
  await stock.assertPresent()
  expect(await getActiveBatchStats()).toEqual(stock.baseline)
  expect(await getBatchRecordsCreatedInLastHour(stock.referenceTime)).toBe(stock.hourlyRecords)
}

export async function createUsableRetainedEmbeddingCapacity(
  quota: Awaited<ReturnType<typeof acquireEmbeddingQuotaFixture>>,
  type: BatchJobType,
) {
  const stock = await createRetainedEmbeddingBatchStock(quota, new Date())
  const config = getRateLimitConfig()
  const restore = overrideDynamicConfigFieldsForTest(bedrockEmbeddingsBatchConfig, {
    max_inflight_jobs: stock.baseline.count + 1,
    max_requests_per_hour: stock.hourlyRecords + config.MAX_REQUESTS_PER_BATCH,
    max_job_size_gb: Math.ceil((stock.baseline.inputSizeMB + config.MAX_BATCH_SIZE_MB) / 1024),
    creation_retry_delay_ms: 30_000,
  })
  quota.restoreAfterDrain(async () => restore())
  const limits = await getBatchCreationLimits(stock.referenceTime)
  if (!limits.allowed)
    throw new Error(`Foreign stock did not preserve usable ${type} headroom: ${limits.reason}`)
  expect(limits.maxRecords).toBeGreaterThanOrEqual(limits.minRecords)
  const minimumSize =
    type === 'images'
      ? minimumImageBatchSizeMB(limits.minRecords)
      : minimumTextBatchSizeMB(limits.minRecords)
  expect(limits.maxSizeMB).toBeGreaterThanOrEqual(minimumSize)
  return stock
}
