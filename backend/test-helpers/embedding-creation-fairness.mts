import { mintUUIDv7 } from '@modules/utils/ids'
import { expect } from 'vitest'
import { beginTransaction, read, type OwnedTransaction } from '@data-stores/psql'
import { allowUnannotatedQuery } from '@data-stores/psql/prepared-statement-name'
import { getRateLimitConfig } from '../services/bedrock-embeddings/batch/config.mts'
import {
  getBatchRecordsCreatedInLastHour,
  getActiveBatchStats,
} from '../services/bedrock-embeddings/batch/orchestrator/poll-queries.mts'
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
  const operations: Promise<unknown>[] = []
  const id = mintUUIDv7()
  let closing: Promise<void> | undefined
  const close = () => (closing ??= closeTransaction())
  quota.beforeRelease(close)
  const start = <T,>(action: () => Promise<T>): Promise<T> => {
    quota.assertOpen()
    if (closing) throw new Error('Fairness snapshot is closing')
    const operation = Promise.resolve().then(action)
    operations.push(operation)
    void operation.catch(() => {})
    return operation
  }
  try {
    transaction = await beginTransaction()
    quota.assertOpen()
    await transaction(allowUnannotatedQuery('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ'))
    quota.assertOpen()
    const before = await getActiveBatchStats({ query: transaction })
    const localGiB = Math.ceil((before.inputSizeMB + remainingMB) / 1024)
    if (!Number.isInteger(localGiB) || localGiB <= 0 || localGiB * 1024 > inflightLimitMB)
      throw new Error('Fairness precondition: integer local size ceiling exceeds normal capacity')
    const reservationMB = localGiB * 1024 - before.inputSizeMB - remainingMB
    if (!Number.isFinite(reservationMB) || reservationMB < 0 || reservationMB >= 1024)
      throw new Error('Fairness precondition: invalid integer-ceiling remainder')
    const reservationCount = reservationMB > 0 ? 1 : 0
    const countLimit = before.count + reservationCount + 1
    if (countLimit > getRateLimitConfig().MAX_INFLIGHT_JOBS)
      throw new Error(
        'Fairness precondition: owned reservation and admission exceed normal count capacity',
      )
    const referenceTime = new Date()
    const hourlyBefore = await getBatchRecordsCreatedInLastHour(referenceTime, {
      query: transaction,
    })
    if (reservationCount)
      await insertTestEmbeddingsBatch(
        {
          id,
          bedrockStatus: 'Submitted',
          batchData: { metadata: { inputSizeMB: reservationMB } },
        },
        { query: transaction },
      )
    const limits = () => start(() => getBatchCreationLimits(referenceTime, { query: transaction! }))
    const dependencies: BatchCreationDependencies = { getBatchCreationLimits: limits, createBatch }
    await assertPresent(reservationMB)
    quota.assertOpen()
    prepared.resolve()
    return {
      before,
      reservationMB,
      reservationCount,
      localGiB,
      countLimit,
      hourlyBefore,
      hourlyRecords: () =>
        start(() => getBatchRecordsCreatedInLastHour(referenceTime, { query: transaction! })),
      limits,
      dependencies,
      assertPresent: () => start(() => assertPresent(reservationMB)),
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
          return { verifiedAbsentCount: reservationCount, remainingCount: 0 }
        }),
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
      allowUnannotatedQuery(`SELECT id, (data->'metadata'->>'inputSizeMB')::DOUBLE PRECISION AS input_size_mb
       FROM bedrock_embedding_batches
       WHERE id = $1 AND submitted_at IS NOT NULL AND completed_at IS NULL
         AND failed_at IS NULL AND cancelled_at IS NULL`),
      [id],
    )
    if (inputSizeMB === 0) {
      const absent = await transaction!(
        allowUnannotatedQuery('SELECT id FROM bedrock_embedding_batches WHERE id = $1'),
        [id],
      )
      expect(absent.rows).toEqual([])
      return
    }
    expect(rows).toHaveLength(1)
    expect(rows[0]!.id).toBe(id)
    expect(rows[0]!.input_size_mb).toBeCloseTo(inputSizeMB, 6)
  }

  async function closeTransaction() {
    await prepared.promise
    await Promise.allSettled(operations)
    await transaction?.[Symbol.asyncDispose]()
    const { rows } = await read(
      allowUnannotatedQuery('SELECT id FROM bedrock_embedding_batches WHERE id = $1'),
      [id],
    )
    expect(rows).toEqual([])
  }
}
