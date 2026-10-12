import { randomUUID } from 'node:crypto'
import { expect } from 'vitest'
import { beginTransaction, read, type OwnedTransaction } from '@data-stores/psql'
import { getActiveBatchStats } from '../services/bedrock-embeddings/batch/orchestrator/poll-queries.mts'
import { getBatchCreationLimits } from '../services/bedrock-embeddings-batch/rate-limits.mts'
import { createBatch } from '../services/bedrock-embeddings-batch/orchestrator/create.mts'
import type { BatchCreationDependencies } from '../services/bedrock-embeddings-batch/types.mts'
import type { acquireEmbeddingQuotaFixture } from './embedding-creation-quota.mts'
import { insertTestEmbeddingsBatch } from './entities/bedrock-embeddings-batches.mts'

/** Real unfiltered accounting at one stable snapshot, with a rollback-owned reservation. */
export async function createEmbeddingFairnessSnapshot(
  quota: Awaited<ReturnType<typeof acquireEmbeddingQuotaFixture>>,
  inflightLimitMB: number,
  remainingMB: number,
) {
  let transaction: OwnedTransaction | undefined
  const prepared = Promise.withResolvers<void>()
  const id = `embedding-fairness-${randomUUID()}`
  let closing: Promise<void> | undefined
  const close = () => (closing ??= closeTransaction())
  quota.beforeRelease(close)
  try {
    transaction = await beginTransaction()
    quota.assertOpen()
    await transaction('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ')
    quota.assertOpen()
    const before = await getActiveBatchStats({ query: transaction })
    const reservationMB = inflightLimitMB - before.inputSizeMB - remainingMB
    if (!Number.isFinite(reservationMB) || reservationMB <= 0)
      throw new Error('Global quota precondition: no positive owned fairness reservation')
    await insertTestEmbeddingsBatch(
      {
        id,
        bedrockStatus: 'Submitted',
        batchData: { metadata: { inputSizeMB: reservationMB } },
      },
      { query: transaction },
    )
    const limits = () => getBatchCreationLimits({ query: transaction })
    const dependencies: BatchCreationDependencies = { getBatchCreationLimits: limits, createBatch }
    await assertPresent(reservationMB)
    quota.assertOpen()
    prepared.resolve()
    return {
      before,
      reservationMB,
      limits,
      dependencies,
      assertPresent: () => assertPresent(reservationMB),
      removeOwnedReservations: async () => {
        await transaction!('DELETE FROM bedrock_embedding_batches WHERE id = $1', [id])
        const { rows } = await transaction!(
          'SELECT id FROM bedrock_embedding_batches WHERE id = $1',
          [id],
        )
        expect(rows).toEqual([])
        return { verifiedAbsentCount: 1, remainingCount: 0 }
      },
    }
  } catch (err) {
    prepared.resolve()
    const [disposed] = await Promise.allSettled([close()])
    if (disposed?.status === 'rejected')
      throw new AggregateError([err, disposed.reason], 'Fairness preparation and rollback failed', {
        cause: err,
      })
    throw err
  }

  async function assertPresent(inputSizeMB: number) {
    const { rows } = await transaction!<{ id: string; input_size_mb: number }>(
      `SELECT id, (data->'metadata'->>'inputSizeMB')::DOUBLE PRECISION AS input_size_mb
       FROM bedrock_embedding_batches
       WHERE id = $1 AND submitted_at IS NOT NULL AND completed_at IS NULL
         AND failed_at IS NULL AND cancelled_at IS NULL`,
      [id],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]!.id).toBe(id)
    expect(rows[0]!.input_size_mb).toBeCloseTo(inputSizeMB, 6)
  }

  async function closeTransaction() {
    await prepared.promise
    await transaction?.[Symbol.asyncDispose]()
    const { rows } = await read('SELECT id FROM bedrock_embedding_batches WHERE id = $1', [id])
    expect(rows).toEqual([])
  }
}
