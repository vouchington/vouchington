import { getMinUUIDv7ForDate, mintUUIDv7 } from '@modules/utils/ids'
import { afterEach, describe, expect, it, onTestFinished } from 'vitest'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { bedrockEmbeddingsBatchConfig } from '../../config.mts'
import {
  cleanupTestEmbeddingsBatches,
  insertTestEmbeddingsBatch,
} from '@voucha/test-helpers/entities/bedrock-embeddings-batches'
import { withEmbeddingQuotaSnapshot } from '@voucha/test-helpers/embedding-quota-snapshot'
import {
  getActiveBatchStats,
  getBatchIdByJobArn,
  getBatchInfo,
  getBatchRecordsCreatedInLastHour,
  getPendingBatches,
} from '../poll-queries.mts'

const createdBatchIds: string[] = []

describe('getPendingBatches', () => {
  afterEach(async () => {
    await cleanupTestEmbeddingsBatches(createdBatchIds.splice(0))
  })

  function batchId() {
    const id = mintUUIDv7()
    createdBatchIds.push(id)
    return id
  }

  it('caps a sweep, advances past unchanged active rows and excludes later IDs', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(bedrockEmbeddingsBatchConfig, {
        batch_listing_page_size: 1,
      }),
    )
    const timestamp = Date.now() + 86_400_000 + Math.floor(Math.random() * 1_000_000_000)
    const ids = [0, 1, 2].map(offset => getMinUUIDv7ForDate(new Date(timestamp + offset)))
    onTestFinished(() => cleanupTestEmbeddingsBatches(ids))
    await Promise.all(ids.map(id => insertTestEmbeddingsBatch({ id, bedrockStatus: 'Submitted' })))
    const first = await getPendingBatches({
      afterId: getMinUUIDv7ForDate(new Date(timestamp - 1)),
      throughId: getMinUUIDv7ForDate(new Date(timestamp + 2)),
    })
    expect(first.batches.map(row => row.id)).toEqual([ids[0]])
    expect(first.hasMore).toBe(true)
    const last = await getPendingBatches(first.nextCursor)
    expect(last.batches.map(row => row.id)).toEqual([ids[1]])
    expect(last.hasMore).toBe(false)
  })

  it('returns only active batches (submitted_at set, no terminal timestamp)', async () => {
    const activeId1 = batchId()
    const activeId2 = batchId()
    const completedId = batchId()
    const failedId = batchId()
    const cancelledId = batchId()
    const preparingId = batchId()

    await Promise.all([
      insertTestEmbeddingsBatch({ id: activeId1, bedrockStatus: 'Submitted' }),
      insertTestEmbeddingsBatch({ id: activeId2, bedrockStatus: 'InProgress' }),
      insertTestEmbeddingsBatch({ id: completedId, bedrockStatus: 'Completed' }),
      insertTestEmbeddingsBatch({ id: failedId, bedrockStatus: 'Failed' }),
      insertTestEmbeddingsBatch({ id: cancelledId, bedrockStatus: 'Stopped' }),
      insertTestEmbeddingsBatch({ id: preparingId, bedrockStatus: 'Preparing' }),
    ])

    const pending = await getPendingBatches()
    const pendingIds = pending.batches.map(r => r.id)

    expect(pendingIds).toContain(activeId1)
    expect(pendingIds).toContain(activeId2)
    expect(pendingIds).not.toContain(completedId)
    expect(pendingIds).not.toContain(failedId)
    expect(pendingIds).not.toContain(cancelledId)
    expect(pendingIds).not.toContain(preparingId)
  })
})

describe('getActiveBatchStats', () => {
  afterEach(async () => {
    await cleanupTestEmbeddingsBatches(createdBatchIds.splice(0))
  })

  function batchId() {
    const id = mintUUIDv7()
    createdBatchIds.push(id)
    return id
  }

  it('counts and sums only active batches', async () => {
    // Capture baseline before inserting — dirty DB may have pre-existing active batches.
    const baseline = await getActiveBatchStats()

    const activeId = batchId()
    const completedId = batchId()
    const failedId = batchId()

    await Promise.all([
      insertTestEmbeddingsBatch({
        id: activeId,
        bedrockStatus: 'Submitted',
        batchData: { metadata: { inputSizeMB: 100 } },
        records: 50,
      }),
      insertTestEmbeddingsBatch({
        id: completedId,
        bedrockStatus: 'Completed',
        batchData: { metadata: { inputSizeMB: 200 } },
        records: 100,
      }),
      insertTestEmbeddingsBatch({
        id: failedId,
        bedrockStatus: 'Failed',
        batchData: { metadata: { inputSizeMB: 300 } },
        records: 150,
      }),
    ])

    // Verify via getPendingBatches that active/non-active classification is correct.
    const pending = await getPendingBatches()
    const pendingIds = pending.batches.map(r => r.id)
    expect(pendingIds).toContain(activeId)
    expect(pendingIds).not.toContain(completedId)
    expect(pendingIds).not.toContain(failedId)

    // Delta must be exactly +1 count / +100 MB — completed and failed must not be counted.
    const stats = await getActiveBatchStats()
    expect(stats.count).toBe(baseline.count + 1)
    expect(stats.inputSizeMB).toBe(baseline.inputSizeMB + 100)
  })
})

describe('getBatchIdByJobArn', () => {
  afterEach(async () => {
    await cleanupTestEmbeddingsBatches(createdBatchIds.splice(0))
  })

  function batchId() {
    const id = mintUUIDv7()
    createdBatchIds.push(id)
    return id
  }

  it('returns the batch id when a matching job_arn exists', async () => {
    const id = batchId()
    const jobArn = `arn:aws:bedrock:us-west-2:123:model-invocation-job/${id}`
    await insertTestEmbeddingsBatch({ id, bedrockStatus: 'Submitted', jobArn })

    const result = await getBatchIdByJobArn(jobArn)

    expect(result).toBe(id)
  })

  it('returns null when no batch matches the job_arn', async () => {
    const result = await getBatchIdByJobArn(
      'arn:aws:bedrock:us-west-2:123:model-invocation-job/nonexistent',
    )

    expect(result).toBeNull()
  })
})

describe('getBatchInfo', () => {
  afterEach(async () => {
    await cleanupTestEmbeddingsBatches(createdBatchIds.splice(0))
  })

  function batchId() {
    const id = mintUUIDv7()
    createdBatchIds.push(id)
    return id
  }

  it('returns the job type and jsonb document', async () => {
    const id = batchId()
    await insertTestEmbeddingsBatch({
      id,
      jobType: 'posts',
      bedrockStatus: 'Submitted',
      batchData: { outputS3Uri: 's3://bucket/out', metadata: { inputSizeMB: 1 } },
    })

    await expect(getBatchInfo(id)).resolves.toEqual({
      job_type: 'posts',
      data: expect.objectContaining({
        status: 'Submitted',
        outputS3Uri: 's3://bucket/out',
      }),
    })
  })

  it('returns null when the batch does not exist', async () => {
    await expect(getBatchInfo(mintUUIDv7())).resolves.toBeNull()
  })
})

describe('getBatchRecordsCreatedInLastHour', () => {
  it('counts a current UUIDv7 batch but excludes a batch from two hours ago', async () => {
    const referenceTime = new Date()
    const recentId = mintUUIDv7()
    const oldId = getMinUUIDv7ForDate(new Date(referenceTime.getTime() - 2 * 60 * 60 * 1000))
    await withEmbeddingQuotaSnapshot(async query => {
      const baseline = await getBatchRecordsCreatedInLastHour(referenceTime, { query })
      await insertTestEmbeddingsBatch({ id: recentId, records: 7 }, { query })
      await insertTestEmbeddingsBatch({ id: oldId, records: 11 }, { query })

      await expect(getBatchRecordsCreatedInLastHour(referenceTime, { query })).resolves.toBe(
        baseline + 7,
      )
    })
  })

  it('uses an inclusive UUIDv7 cutoff at one millisecond after the one-hour boundary', async () => {
    const referenceTime = new Date(
      Date.now() + 86_400_000 + Math.floor(Math.random() * 1_000_000_000),
    )
    const strictOneHourBoundary = new Date(referenceTime.getTime() - 60 * 60 * 1000)
    const ids = [0, 1, 2].map(offset =>
      getMinUUIDv7ForDate(new Date(strictOneHourBoundary.getTime() + offset)),
    )
    await withEmbeddingQuotaSnapshot(async query => {
      const baseline = await getBatchRecordsCreatedInLastHour(referenceTime, { query })
      await insertTestEmbeddingsBatch({ id: ids[0], records: 3 }, { query })
      await insertTestEmbeddingsBatch({ id: ids[1], records: 5 }, { query })
      await insertTestEmbeddingsBatch({ id: ids[2], records: 7 }, { query })

      await expect(getBatchRecordsCreatedInLastHour(referenceTime, { query })).resolves.toBe(
        baseline + 12,
      )
    })
  })
})
