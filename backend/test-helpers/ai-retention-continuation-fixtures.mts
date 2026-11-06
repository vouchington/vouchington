import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import { acquireTestPostgresAdvisoryLock } from './postgres-advisory-lock.mts'
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

export function reserveAIRetentionContinuationJobs() {
  return acquireTestPostgresAdvisoryLock({
    namespace: 45291,
    key: 1,
    timeout: '25s',
  })
}

/**
 * Each fixture ages its rows inside a private far-future window. The text cache scopes by its
 * exact window; other families pass explicit owned ids. The cache and batch families use a
 * one-millisecond window because
 * their committed rows stay in the shared database and a wider window can sweep another
 * fixture's leftover row as an extra page. Cursor-backed families also keep a rollback-scoped
 * cursor.
 */
// oxlint-disable-next-line typescript/consistent-return -- Typed family switch is exhaustive; Oxlint misses its terminal flow.
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
      const excludedHash = await insertTextEmbeddingForRetentionTest(
        setup,
        new Date(aged.getTime() - 1),
      )
      await setup.commit()
      return {
        options: { ...window, batchSize: 1, maxBatches: 1 },
        excludedState: async () => {
          await using reader = await beginTransaction()
          return await textEmbeddingExistsForRetentionTest(reader, excludedHash)
        },
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
      const ownedAt = new Date(aged.getTime() + 1)
      const ownedNow = new Date(window.now.getTime() + 1)
      await using setup = await beginTransaction()
      const batchIds = await Promise.all(
        [ownedAt, ownedAt, null].map(at => insertEmbeddingBatchForRetentionTest(setup, at)),
      )
      const excludedId = await insertEmbeddingBatchForRetentionTest(setup, aged)
      await setup.commit()
      return {
        options: { ...window, now: ownedNow, batchSize: 1, maxBatches: 1, batchIds },
        excludedState: async () => {
          await using reader = await beginTransaction()
          return await embeddingBatchExistsForRetentionTest(reader, excludedId)
        },
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
      const excludedIds = await insertRetentionMediaFixture(query, new Date(old.getTime() - 5), now)
      await resetMediaDeliveryRetentionCursorForTest(query)
      return {
        options: { ...limits, query, changeIds },
        excludedState: () =>
          Promise.all(excludedIds.map(id => mediaDeliveryTransitionExistsForTest(id, query))),
        passes: 3,
        expected: [false, true, false, true],
        state: () =>
          Promise.all(changeIds.map(id => mediaDeliveryTransitionExistsForTest(id, query))),
      }
    }
  }
}
