import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  cleanupTestEmbeddingsBatches,
  cleanupTestEmbeddingsBatchesByPrefix,
  insertTestEmbeddingsBatch,
} from '@voucha/test-helpers/entities/bedrock-embeddings-batches'
import { getActiveBatchStats, getBatchIdByJobArn, getPendingBatches } from '../poll-queries.mts'

const batchIdPrefix = 'poll-test-'
const createdBatchIds: string[] = []

describe('getPendingBatches', () => {
  beforeEach(async () => {
    await cleanupTestEmbeddingsBatchesByPrefix(batchIdPrefix)
  })

  afterEach(async () => {
    await cleanupTestEmbeddingsBatches(createdBatchIds.splice(0))
  })

  function batchId() {
    const id = `${batchIdPrefix}${randomUUID()}`
    createdBatchIds.push(id)
    return id
  }

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
    const pendingIds = pending.map(r => r.id)

    expect(pendingIds).toContain(activeId1)
    expect(pendingIds).toContain(activeId2)
    expect(pendingIds).not.toContain(completedId)
    expect(pendingIds).not.toContain(failedId)
    expect(pendingIds).not.toContain(cancelledId)
    expect(pendingIds).not.toContain(preparingId)
  })
})

describe('getActiveBatchStats', () => {
  beforeEach(async () => {
    await cleanupTestEmbeddingsBatchesByPrefix(batchIdPrefix)
  })

  afterEach(async () => {
    await cleanupTestEmbeddingsBatches(createdBatchIds.splice(0))
  })

  function batchId() {
    const id = `${batchIdPrefix}${randomUUID()}`
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
    const pendingIds = pending.map(r => r.id)
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
    const id = `${batchIdPrefix}${randomUUID()}`
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
