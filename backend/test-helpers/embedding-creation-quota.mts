import { randomUUID } from 'node:crypto'
import { expect, onTestFinished } from 'vitest'
import { advisoryLockPool } from '@data-stores/psql'
import { read } from './fixture-executor.mts'
import type { PoolClient } from '@data-stores/psql/types'
import { initializeEmbeddingCreationConfig } from './embedding-creation-config.mts'
import { claimEmbeddingQuotaLease } from './embedding-creation-quota-lease.mts'
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
  onTestFinished(close)
  try {
    client = await advisoryLockPool.connect()
    assertOpen()
    // A different valid invocation can hold the reservation for its whole test budget.
    // Acquisition has its own bounded hook budget; subsequent fixture queries remain short.
    await client.query("SET statement_timeout = '20s'")
    assertOpen()
    await client.query('SELECT pg_advisory_lock(hashtextextended($1, 0))', [key])
    acquired = true
    assertOpen()
    lease = await claimEmbeddingQuotaLease(client, key)
    assertOpen()
    restoreConfig = await initializeEmbeddingCreationConfig()
    assertOpen()
    await client.query("SET statement_timeout = '5s'")
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
    removeOwnedReservations: async () => {
      const ownedIds = [...ids]
      await cleanupTestEmbeddingsBatches(ownedIds)
      await assertOwnedAccountingRemoved(ownedIds)
      ids.length = 0
      return { verifiedAbsentCount: ownedIds.length, remainingCount: 0 }
    },
    insertCompletedControl: () => {
      assertOpen()
      const id = `embedding-completed-control-${randomUUID()}`
      ids.push(id)
      const write = Promise.resolve().then(async () => {
        assertOpen()
        await insertTestEmbeddingsBatch({
          id,
          bedrockStatus: 'Completed',
          records: 1,
          batchData: { metadata: { inputSizeMB: 0 } },
        })
        await assertOwnedCompletedControl(id)
        return { id, records: 1 }
      })
      writes.push(write)
      void write.catch(() => {})
      return write
    },
  }

  async function dispose() {
    await prepared.promise
    const errors: unknown[] = []
    const attempt = async (action: () => unknown) => {
      try {
        await action()
      } catch (err) {
        errors.push(err)
      }
    }
    // Registered queue drain comes before restoring config used by active processors.
    let safeToRestore = true
    for (const drain of drains) {
      if (!safeToRestore && !drain.safeAfterFailure) continue
      const [result] = await Promise.allSettled([Promise.resolve().then(drain.run)])
      if (result!.status === 'rejected') {
        errors.push(result!.reason)
        let safe = false
        await attempt(() => {
          safe = drain.safeAfterFailure?.() ?? false
        })
        safeToRestore = safeToRestore && safe
      }
    }
    for (const write of writes) await attempt(() => write)
    if (safeToRestore && restoreConfig) {
      const beforeRestoration = errors.length
      await attempt(() => restoreConfig?.())
      await attempt(() => cleanupTestEmbeddingsBatches(ids))
      await attempt(() => assertOwnedAccountingRemoved(ids))
      if (errors.length === beforeRestoration) await attempt(() => lease?.removeAfterRestoration())
    }
    if (acquired)
      await attempt(async () => {
        const { rows } = await client!.query<{ unlocked: boolean }>(
          'SELECT pg_advisory_unlock(hashtextextended($1, 0)) AS unlocked',
          [key],
        )
        if (!rows[0]?.unlocked) throw new Error('Global quota fixture lock was not released')
      })
    await attempt(() => client?.query('RESET statement_timeout'))
    await attempt(() =>
      client?.release(
        errors.length
          ? new AggregateError(errors, 'Quota disposal failed', { cause: errors[0] })
          : undefined,
      ),
    )
    if (errors.length)
      throw new AggregateError(
        errors,
        safeToRestore
          ? 'Quota fixture teardown failed'
          : 'Quota fixture teardown failed; config/accounting restoration withheld after unsafe drain',
        { cause: errors[0] },
      )
  }
}

/** Teardown observes only owned identity; unrelated global accounting may keep changing. */
async function assertOwnedAccountingRemoved(ids: string[]) {
  if (ids.length === 0) return
  const { rows } = await read<{ id: string }>(
    `/* embeddingQuotaFixture:ownedRemoval */
    SELECT id FROM bedrock_embedding_batches WHERE id = ANY($1)`,
    [ids],
  )
  expect(rows).toEqual([])
}

/** Verify a real completed hourly contribution, with no active count or size contribution. */
async function assertOwnedCompletedControl(id: string) {
  const { rows } = await read<{ id: string; records: number; input_size_mb: number }>(
    `/* embeddingQuotaFixture:completedControl */
    SELECT id, records,
      (data->'metadata'->>'inputSizeMB')::DOUBLE PRECISION AS input_size_mb
    FROM bedrock_embedding_batches
    WHERE id = $1 AND submitted_at IS NOT NULL AND completed_at IS NOT NULL
      AND failed_at IS NULL AND cancelled_at IS NULL
      AND created_at > NOW() - INTERVAL '1 hour'`,
    [id],
  )
  expect(rows).toEqual([{ id, records: 1, input_size_mb: 0 }])
}
