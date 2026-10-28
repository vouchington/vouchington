import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import type { AIRetentionFamily } from '@queues/psql/types'
import {
  embeddingBatchExistsForRetentionTest,
  insertEmbeddingBatchForRetentionTest,
  insertTextEmbeddingForRetentionTest,
  textEmbeddingExistsForRetentionTest,
} from './entities/ai-retention.mts'
import {
  mediaDeliveryTransitionExistsForTest,
  resetMediaDeliveryRetentionCursorForTest,
} from './entities/media-delivery-retention.mts'
import { createIsolatedRetentionWindow } from './retention-window.mts'
import { insertRetentionMediaFixture } from './ai-retention-continuation-schema.mts'

/**
 * Each fixture ages its rows inside a private far-future window, so the production cleanup is
 * scoped by owned rows alone. Cursor-backed families also keep a rollback-scoped cursor.
 */
export async function createAIRetentionContinuationFixture(
  family: AIRetentionFamily,
  query: TransactionQuery,
) {
  const { now, at, lowerBoundDate } = createIsolatedRetentionWindow()
  const old = at(122)
  const limits = { now, lowerBoundDate, batchSize: 1, maxBatches: 1 }
  switch (family) {
    case 'textEmbeddingCache': {
      await using setup = await beginTransaction()
      const contentHashes = await Promise.all(
        [old, old, now].map(at => insertTextEmbeddingForRetentionTest(setup, at)),
      )
      await setup.commit()
      return {
        options: limits,
        passes: 2,
        expected: [false, false, true],
        state: async () => {
          await using reader = await beginTransaction()
          return await Promise.all(
            contentHashes.map(hash => textEmbeddingExistsForRetentionTest(reader, hash)),
          )
        },
      }
    }
    case 'terminalEmbeddingBatches': {
      await using setup = await beginTransaction()
      const batchIds = await Promise.all(
        [old, old, null].map(at => insertEmbeddingBatchForRetentionTest(setup, at)),
      )
      await setup.commit()
      return {
        options: limits,
        passes: 2,
        expected: [false, false, true],
        state: async () => {
          await using reader = await beginTransaction()
          return await Promise.all(
            batchIds.map(id => embeddingBatchExistsForRetentionTest(reader, id)),
          )
        },
      }
    }
    case 'oldMediaDeliveryChanges': {
      const changeIds = await insertRetentionMediaFixture(query, old, now)
      await resetMediaDeliveryRetentionCursorForTest(query)
      return {
        options: { ...limits, query },
        passes: 3,
        expected: [false, true, false, true],
        state: () =>
          Promise.all(changeIds.map(id => mediaDeliveryTransitionExistsForTest(id, query))),
      }
    }
  }
}
