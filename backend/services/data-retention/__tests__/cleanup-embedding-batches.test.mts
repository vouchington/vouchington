import { describe, expect, it } from 'vitest'
import { beginTransaction } from '@voucha/test-helpers'
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
