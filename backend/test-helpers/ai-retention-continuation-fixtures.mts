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
import { createExactRetentionWindow, createIsolatedRetentionWindow } from './retention-window.mts'
import { insertRetentionMediaFixture } from './ai-retention-continuation-schema.mts'

const TEXT_EMBEDDING_RETENTION_DAYS = 90
const EMBEDDING_BATCH_RETENTION_DAYS = 30

/**
 * Each fixture ages its rows inside a private far-future window, so the production cleanup is
 * scoped by owned rows alone. The cache and batch families use a one-millisecond window because
 * their committed rows stay in the shared database and a wider window can sweep another
 * fixture's leftover row as an extra page. Cursor-backed families also keep a rollback-scoped
 * cursor.
 */
export async function createAIRetentionContinuationFixture(
  family: AIRetentionFamily,
  query: TransactionQuery,
) {
  switch (family) {
    case 'textEmbeddingCache': {
      const { aged, ...window } = createExactRetentionWindow(TEXT_EMBEDDING_RETENTION_DAYS)
      await using setup = await beginTransaction()
      const contentHashes = await Promise.all(
        [aged, aged, window.now].map(at => insertTextEmbeddingForRetentionTest(setup, at)),
      )
      await setup.commit()
      return {
        options: { ...window, batchSize: 1, maxBatches: 1 },
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
      const { aged, ...window } = createExactRetentionWindow(EMBEDDING_BATCH_RETENTION_DAYS)
      await using setup = await beginTransaction()
      const batchIds = await Promise.all(
        [aged, aged, null].map(at => insertEmbeddingBatchForRetentionTest(setup, at)),
      )
      await setup.commit()
      return {
        options: { ...window, batchSize: 1, maxBatches: 1 },
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
      const { now, at, lowerBoundDate } = createIsolatedRetentionWindow()
      const old = at(122)
      const limits = { now, lowerBoundDate, batchSize: 1, maxBatches: 1 }
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
