import { describe, expect, it } from 'vitest'
import { beginTransaction } from '@voucha/test-helpers'
import { runBeforePostgresStatementForTest } from '@voucha/test-helpers/injected-failures'
import { createIsolatedRetentionWindow } from '@voucha/test-helpers/retention-window'
import {
  embeddingBatchExistsForRetentionTest,
  insertEmbeddingBatchForRetentionTest,
} from '@voucha/test-helpers/entities/ai-retention'
import {
  countEmbeddingBatchEntitiesForRetentionTest,
  insertEmbeddingBatchEntitiesForRetentionTest,
  insertEmbeddingRetentionPosts,
} from '@voucha/test-helpers/entities/ai-retention-embedding-entities'
import { deleteEmbeddingBatchForRetentionTest } from '@voucha/test-helpers/entities/embedding-batch-retention-cleanup'
import { cleanupTerminalEmbeddingBatches } from '../cleanup-embedding-batches.mts'

describe('terminal embedding batch retention', () => {
  it('drains associations in bounded transactions before deleting their batch', async () => {
    const { now, at, lowerBoundDate } = createIsolatedRetentionWindow()
    await using setup = await beginTransaction()
    const postIds = await insertEmbeddingRetentionPosts(setup, 5)
    const batchId = await insertEmbeddingBatchForRetentionTest(setup, at(40), 'posts')
    await insertEmbeddingBatchEntitiesForRetentionTest(setup, batchId, postIds)
    await setup.commit()
    await using reader = await beginTransaction()
    const options = { now, lowerBoundDate, batchSize: 2, maxBatches: 1 }
    for (const remaining of [3, 1]) {
      expect(await cleanupTerminalEmbeddingBatches(options)).toMatchObject({
        deleted: 0,
        hasMore: true,
      })
      expect(await countEmbeddingBatchEntitiesForRetentionTest(reader, batchId)).toBe(remaining)
      expect(await embeddingBatchExistsForRetentionTest(reader, batchId)).toBe(true)
    }
    expect(await cleanupTerminalEmbeddingBatches(options)).toMatchObject({
      deleted: 1,
      hasMore: false,
    })
    expect(await embeddingBatchExistsForRetentionTest(reader, batchId)).toBe(false)
  })

  it('lets overlapping pages drain an expired batch within each association budget', async () => {
    const { now, at, lowerBoundDate } = createIsolatedRetentionWindow()
    await using setup = await beginTransaction()
    const postIds = await insertEmbeddingRetentionPosts(setup, 4)
    const batchId = await insertEmbeddingBatchForRetentionTest(setup, at(40), 'posts')
    await insertEmbeddingBatchEntitiesForRetentionTest(setup, batchId, postIds)
    await setup.commit()

    const options = { now, lowerBoundDate, batchSize: 2, maxBatches: 1, batchIds: [batchId] }
    const restore = runBeforePostgresStatementForTest(
      'deleteEmbeddingBatchEntityPage',
      async () => {
        const concurrent = await cleanupTerminalEmbeddingBatches(options)
        expect(concurrent).toMatchObject({ deleted: 0, hasMore: true })
        await using reader = await beginTransaction()
        expect(await countEmbeddingBatchEntitiesForRetentionTest(reader, batchId)).toBe(2)
      },
    )
    try {
      expect(await cleanupTerminalEmbeddingBatches(options)).toMatchObject({
        deleted: 1,
        hasMore: false,
      })
      await using reader = await beginTransaction()
      expect(await embeddingBatchExistsForRetentionTest(reader, batchId)).toBe(false)
    } finally {
      restore()
      await using cleanup = await beginTransaction()
      await deleteEmbeddingBatchForRetentionTest(cleanup, batchId)
      await cleanup.commit()
    }
  })

  it('deletes a full parent page and caps total association deletion across that page', async () => {
    const { now, at, lowerBoundDate } = createIsolatedRetentionWindow()
    const old = at(40)
    await using setup = await beginTransaction()
    const postIds = await insertEmbeddingRetentionPosts(setup, 4)
    const batches = await Promise.all(
      Array.from({ length: 3 }, () => insertEmbeddingBatchForRetentionTest(setup, old, 'posts')),
    )
    await Promise.all(
      batches
        .slice(0, 2)
        .map((id, index) =>
          insertEmbeddingBatchEntitiesForRetentionTest(
            setup,
            id,
            postIds.slice(index * 2, index * 2 + 2),
          ),
        ),
    )
    await setup.commit()
    await using reader = await beginTransaction()
    const options = { now, lowerBoundDate, batchSize: 2, maxBatches: 1 }
    const count = async () =>
      (
        await Promise.all(
          batches.map(id => countEmbeddingBatchEntitiesForRetentionTest(reader, id)),
        )
      ).reduce((total, value) => total + value, 0)
    for (const remaining of [2, 0]) {
      await cleanupTerminalEmbeddingBatches(options)
      expect(await count()).toBe(remaining)
    }
    await cleanupTerminalEmbeddingBatches(options)
    expect(
      await Promise.all(batches.map(id => embeddingBatchExistsForRetentionTest(reader, id))),
    ).toEqual([false, false, false])
  })

  it('pages childless terminal batches without touching a non-terminal one', async () => {
    const { now, at, lowerBoundDate } = createIsolatedRetentionWindow()
    await using setup = await beginTransaction()
    const terminal = await Promise.all(
      Array.from({ length: 3 }, () => insertEmbeddingBatchForRetentionTest(setup, at(40))),
    )
    const active = await insertEmbeddingBatchForRetentionTest(setup, null)
    await setup.commit()
    await using reader = await beginTransaction()
    const options = { now, lowerBoundDate, batchSize: 2, maxBatches: 1 }
    expect(await cleanupTerminalEmbeddingBatches(options)).toMatchObject({
      deleted: 2,
      hasMore: true,
    })
    expect(await cleanupTerminalEmbeddingBatches(options)).toMatchObject({
      deleted: 1,
      hasMore: false,
    })
    expect(
      await Promise.all(terminal.map(id => embeddingBatchExistsForRetentionTest(reader, id))),
    ).toEqual([false, false, false])
    expect(await embeddingBatchExistsForRetentionTest(reader, active)).toBe(true)
  })
})
