import { randomUUID } from 'node:crypto'
import { expect, onTestFinished } from 'vitest'
import { advisoryLockPool, read } from '@data-stores/psql'
import {
  cleanupTestEmbeddingsBatches,
  insertTestEmbeddingsBatch,
} from './entities/bedrock-embeddings-batches.mts'

/** Coordinates these fixtures, not unrelated production writers or a separate provider account. */
export async function acquireEmbeddingQuotaFixture() {
  const client = await advisoryLockPool.connect()
  const key = 'embedding-creation-global-quota-fixture'
  const ids: string[] = []
  const drains: Array<{ run(): Promise<void>; safeAfterFailure?: () => boolean }> = []
  let acquired = false
  let accountingBaseline: Awaited<ReturnType<typeof readGlobalUsage>> | undefined
  let disposal: Promise<void> | undefined
  const close = () => (disposal ??= dispose())
  onTestFinished(close)
  try {
    await client.query("SET statement_timeout = '5s'")
    await client.query('SELECT pg_advisory_lock(hashtextextended($1, 0))', [key])
    acquired = true
  } catch (err) {
    const [disposed] = await Promise.allSettled([close()])
    if (disposed?.status === 'rejected')
      throw new AggregateError([err, disposed.reason], 'Quota acquisition and cleanup failed', {
        cause: err,
      })
    throw err
  }
  return {
    close,
    beforeRelease: (run: () => Promise<void>, safeAfterFailure?: () => boolean) =>
      drains.push({ run, safeAfterFailure }),
    readGlobalUsage,
    removeOwnedReservations: async () => {
      await cleanupTestEmbeddingsBatches(ids)
      ids.length = 0
      return readGlobalUsage()
    },
    insertOtherWork: async (inputSizeMB: number) => {
      const before = await readGlobalUsage()
      accountingBaseline ??= before
      const id = `embedding-other-work-${randomUUID()}`
      ids.push(id)
      await insertTestEmbeddingsBatch({
        id,
        bedrockStatus: 'Submitted',
        batchData: { metadata: { inputSizeMB } },
      })
      const after = await readGlobalUsage()
      expect(after.count).toBe(before.count + 1)
      expect(after.inputSizeMB - before.inputSizeMB).toBeCloseTo(inputSizeMB, 6)
      return { before, after }
    },
    insertCountReservation: async () => {
      const before = await readGlobalUsage()
      accountingBaseline ??= before
      const id = `embedding-capacity-${randomUUID()}`
      ids.push(id)
      await insertTestEmbeddingsBatch({ id, bedrockStatus: 'Submitted' })
      const after = await readGlobalUsage()
      expect(after.count).toBe(before.count + 1)
      expect(after.inputSizeMB).toBe(before.inputSizeMB)
      // The first CI group requires admitted baseline usage; the caller verifies that
      // this owned row alone crosses its configured count ceiling. No foreign filtering.
      return { before, after }
    },
    insertFairnessReservation: async (inflightLimitMB: number, remainingMB: number) => {
      const before = await readGlobalUsage()
      accountingBaseline ??= before
      const reservationMB = inflightLimitMB - before.inputSizeMB - remainingMB
      if (!Number.isFinite(reservationMB) || reservationMB < 0)
        throw new Error('Global quota precondition: no nonnegative owned reservation')
      const id = `embedding-fairness-${randomUUID()}`
      ids.push(id)
      await insertTestEmbeddingsBatch({
        id,
        bedrockStatus: 'Submitted',
        batchData: { metadata: { inputSizeMB: reservationMB } },
      })
      const after = await readGlobalUsage()
      expect(after.count).toBe(before.count + 1)
      expect(after.inputSizeMB - before.inputSizeMB).toBeCloseTo(reservationMB, 6)
      return { before, reservationMB }
    },
  }

  async function dispose() {
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
    if (safeToRestore) {
      await attempt(() => cleanupTestEmbeddingsBatches(ids))
      const baseline = accountingBaseline
      if (baseline)
        await attempt(async () => {
          const restored = await readGlobalUsage()
          expect(restored.count).toBe(baseline.count)
          expect(restored.inputSizeMB).toBeCloseTo(baseline.inputSizeMB, 6)
        })
    }
    if (acquired)
      await attempt(async () => {
        const { rows } = await client.query<{ unlocked: boolean }>(
          'SELECT pg_advisory_unlock(hashtextextended($1, 0)) AS unlocked',
          [key],
        )
        if (!rows[0]?.unlocked) throw new Error('Global quota fixture lock was not released')
      })
    await attempt(() => client.query('RESET statement_timeout'))
    await attempt(() =>
      client.release(
        errors.length ? new AggregateError(errors, 'Quota disposal failed') : undefined,
      ),
    )
    if (errors.length)
      throw new AggregateError(
        errors,
        safeToRestore
          ? 'Quota fixture teardown failed'
          : 'Quota fixture teardown failed; config/accounting restoration withheld after unsafe drain',
      )
  }
}

/** Full global accounting; no owned-ID, model, date, account or queue exclusion. */
async function readGlobalUsage() {
  const { rows } = await read<{ count: string; input_size_mb: number }>(
    `/* embeddingQuotaFixture:globalUsage */
    SELECT COUNT(*)::text AS count,
      COALESCE(SUM((data->'metadata'->>'inputSizeMB')::DOUBLE PRECISION), 0) AS input_size_mb
    FROM bedrock_embedding_batches
    WHERE submitted_at IS NOT NULL AND completed_at IS NULL
      AND failed_at IS NULL AND cancelled_at IS NULL`,
  )
  return { count: Number(rows[0]!.count), inputSizeMB: rows[0]!.input_size_mb }
}
