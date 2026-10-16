import { mintUUIDv7 } from '@modules/utils/ids'
import { expect } from 'vitest'
import { beginTransaction, read, type OwnedTransaction } from '@data-stores/psql'
import { allowUnannotatedQuery } from '@data-stores/psql/prepared-statement-name'
import { getActiveBatchStats } from '../services/bedrock-embeddings/batch/orchestrator/poll-queries.mts'
import { getBatchCreationLimits } from '../services/bedrock-embeddings-batch/rate-limits.mts'
import { createBatch } from '../services/bedrock-embeddings-batch/orchestrator/create.mts'
import type { BatchCreationDependencies } from '../services/bedrock-embeddings-batch/types.mts'
import type { acquireEmbeddingQuotaFixture } from './embedding-creation-quota.mts'
import { insertTestEmbeddingsBatch } from './entities/bedrock-embeddings-batches.mts'

/** Unfiltered production admission and one owned count reservation share a stable snapshot. */
export async function createEmbeddingCountSnapshot(
  quota: Awaited<ReturnType<typeof acquireEmbeddingQuotaFixture>>,
) {
  let transaction: OwnedTransaction | undefined
  let closing: Promise<void> | undefined
  const operations: Promise<unknown>[] = []
  const id = mintUUIDv7()
  const start = <T,>(action: () => Promise<T>): Promise<T> => {
    quota.assertOpen()
    if (closing) throw new Error('Embedding count snapshot is closing')
    const operation = Promise.resolve().then(action)
    operations.push(operation)
    void operation.catch(() => {})
    return operation
  }
  let setup: Promise<Awaited<ReturnType<typeof getActiveBatchStats>>>
  const close = () => (closing ??= dispose())
  // The registered disposer waits for a transaction acquired after cleanup has started.
  quota.beforeRelease(close)
  setup = start(async () => {
    transaction = await beginTransaction()
    quota.assertOpen()
    await transaction(allowUnannotatedQuery('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ'))
    quota.assertOpen()
    return getActiveBatchStats({ query: transaction })
  })
  let before: Awaited<typeof setup>
  try {
    before = await setup
  } catch (err) {
    const [disposed] = await Promise.allSettled([close()])
    if (disposed?.status === 'rejected')
      throw new AggregateError([err, disposed.reason], 'Count snapshot setup and rollback failed', {
        cause: err,
      })
    throw err
  }
  const limits = () => start(() => getBatchCreationLimits({ query: transaction! }))
  const dependencies: BatchCreationDependencies = { getBatchCreationLimits: limits, createBatch }
  return {
    before,
    limits,
    dependencies,
    insertReservation: () =>
      start(async () => {
        await insertTestEmbeddingsBatch(
          {
            id,
            bedrockStatus: 'Submitted',
            batchData: { metadata: { inputSizeMB: 1 } },
          },
          { query: transaction! },
        )
        const { rows } = await transaction!<{ id: string; input_size_mb: number }>(
          allowUnannotatedQuery(`SELECT id, (data->'metadata'->>'inputSizeMB')::DOUBLE PRECISION AS input_size_mb
         FROM bedrock_embedding_batches WHERE id = $1 AND submitted_at IS NOT NULL
           AND completed_at IS NULL AND failed_at IS NULL AND cancelled_at IS NULL`),
          [id],
        )
        expect(rows).toEqual([{ id, input_size_mb: 1 }])
      }),
    removeOwnedReservations: () =>
      start(async () => {
        await transaction!(
          allowUnannotatedQuery('DELETE FROM bedrock_embedding_batches WHERE id = $1'),
          [id],
        )
        const { rows } = await transaction!(
          allowUnannotatedQuery('SELECT id FROM bedrock_embedding_batches WHERE id = $1'),
          [id],
        )
        expect(rows).toEqual([])
        return { verifiedAbsentCount: 1, remainingCount: 0 }
      }),
  }

  async function dispose() {
    await Promise.allSettled([setup])
    // No rollback races an in-flight limits query, insert or verification.
    await Promise.allSettled(operations)
    await transaction?.[Symbol.asyncDispose]()
    const { rows } = await read(
      allowUnannotatedQuery('SELECT id FROM bedrock_embedding_batches WHERE id = $1'),
      [id],
    )
    expect(rows).toEqual([])
  }
}
