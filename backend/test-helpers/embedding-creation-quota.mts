import { mintUUIDv7 } from '@modules/utils/ids'
import { onTestFinished } from 'vitest'
import { advisoryLockPool } from '@data-stores/psql'
import { allowUnannotatedQuery } from '@data-stores/psql/prepared-statement-name'
import type { PoolClient } from '@data-stores/psql/types'
import { initializeEmbeddingCreationConfig } from './embedding-creation-config.mts'
import {
  assertEmbeddingQuotaLeaseHeld,
  claimEmbeddingQuotaLease,
} from './embedding-creation-quota-lease.mts'
import { disposeEmbeddingQuotaFixture } from './embedding-creation-quota-disposal.mts'
import { assertOwnedSubmittedControl } from './embedding-creation-submitted-control.mts'
import {
  assertOwnedAccountingRemoved,
  assertOwnedCompletedControl,
} from './embedding-creation-quota-assertions.mts'
import {
  cleanupTestEmbeddingsBatches,
  insertTestEmbeddingsBatch,
} from './entities/bedrock-embeddings-batches.mts'

/** Coordinates these fixtures, not unrelated production writers or a separate provider account. */
export async function acquireEmbeddingQuotaFixture() {
  let client: PoolClient | undefined
  const prepared = Promise.withResolvers<void>()
  const key = 'embedding-creation-global-quota-fixture'
  const ids: string[] = []
  const writes: Promise<unknown>[] = []
  const drains: Array<{ run(): Promise<void>; safeAfterFailure?: () => boolean }> = []
  const configRestorers: Array<() => Promise<void>> = []
  const leaseReleaseCallbacks: Array<() => Promise<void>> = []
  let acquired = false
  let restoreConfig: (() => void) | undefined
  let lease: Awaited<ReturnType<typeof claimEmbeddingQuotaLease>> | undefined
  let disposal: Promise<void> | undefined
  let closing = false
  const assertOpen = () => {
    if (closing) throw new Error('Embedding quota fixture is closing')
  }
  const close = () => {
    closing = true
    return (disposal ??= dispose())
  }
  const trackOperation = <T,>(run: () => Promise<T>): Promise<T> => {
    assertOpen()
    const operation = Promise.resolve().then(() => {
      assertOpen()
      return run()
    })
    writes.push(operation)
    void operation.catch(() => {})
    return operation
  }
  onTestFinished(close)
  try {
    client = await advisoryLockPool.connect()
    assertOpen()
    // A different valid invocation can hold the reservation for its whole test budget.
    // Acquisition has its own bounded hook budget; subsequent fixture queries remain short.
    await client.query(allowUnannotatedQuery("SET statement_timeout = '20s'"))
    assertOpen()
    await client.query(allowUnannotatedQuery('SELECT pg_advisory_lock(hashtextextended($1, 0))'), [
      key,
    ])
    acquired = true
    assertOpen()
    lease = await claimEmbeddingQuotaLease(client, key)
    assertOpen()
    restoreConfig = await initializeEmbeddingCreationConfig()
    assertOpen()
    await client.query(allowUnannotatedQuery("SET statement_timeout = '5s'"))
    assertOpen()
  } catch (err) {
    prepared.resolve()
    const [disposed] = await Promise.allSettled([close()])
    if (disposed?.status === 'rejected')
      throw new AggregateError([err, disposed.reason], 'Quota acquisition and cleanup failed', {
        cause: err,
      })
    throw err
  }
  prepared.resolve()
  return {
    close,
    assertOpen,
    beforeRelease: (run: () => Promise<void>, safeAfterFailure?: () => boolean) => {
      assertOpen()
      drains.push({ run, safeAfterFailure })
    },
    restoreAfterDrain: (run: () => Promise<void>) => {
      assertOpen()
      configRestorers.push(run)
    },
    beforeLeaseRelease: (run: () => Promise<void>) => {
      assertOpen()
      leaseReleaseCallbacks.push(run)
    },
    assertLeaseHeld: () => assertEmbeddingQuotaLeaseHeld(client!, key),
    trackOperation,
    removeOwnedReservations: async () => {
      const ownedIds = [...ids]
      await cleanupTestEmbeddingsBatches(ownedIds)
      await assertOwnedAccountingRemoved(ownedIds)
      ids.length = 0
      return { verifiedAbsentCount: ownedIds.length, remainingCount: 0 }
    },
    insertSubmittedControl: () => {
      assertOpen()
      const id = mintUUIDv7()
      ids.push(id)
      return trackOperation(async () => {
        await insertTestEmbeddingsBatch({
          id,
          bedrockStatus: 'Submitted',
          batchData: { metadata: { inputSizeMB: 1 } },
        })
        await assertOwnedSubmittedControl(id)
        return { id }
      })
    },
    insertSubmittedReservation: (inputSizeMB: number) => {
      assertOpen()
      if (!Number.isFinite(inputSizeMB) || inputSizeMB <= 0)
        throw new Error('Embedding quota reservation must have a positive finite size')
      const id = mintUUIDv7()
      ids.push(id)
      return trackOperation(async () => {
        await insertTestEmbeddingsBatch({
          id,
          bedrockStatus: 'Submitted',
          batchData: { metadata: { inputSizeMB } },
        })
        return { id, inputSizeMB }
      })
    },
    assertSubmittedReservation: (id: string, inputSizeMB: number) =>
      assertOwnedSubmittedControl(id, inputSizeMB),
    insertCompletedControl: () => {
      assertOpen()
      const id = mintUUIDv7()
      ids.push(id)
      return trackOperation(async () => {
        await insertTestEmbeddingsBatch({
          id,
          bedrockStatus: 'Completed',
          records: 1,
          batchData: { metadata: { inputSizeMB: 0 } },
        })
        await assertOwnedCompletedControl(id)
        return { id, records: 1 }
      })
    },
  }

  async function dispose() {
    await disposeEmbeddingQuotaFixture({
      prepared: prepared.promise,
      drains,
      writes,
      configRestorers,
      leaseReleaseCallbacks,
      restoreConfig,
      ids,
      lease,
      client,
      key,
      acquired,
    })
  }
}
