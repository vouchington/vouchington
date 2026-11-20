import type { Job } from 'glide-mq'
import { onTestFinished } from 'vitest'
import { jobSerializationPool } from '@data-stores/psql'
import type { PoolClient } from '@data-stores/psql/types'
import { rateLimiterValkeyClient } from '@data-stores/valkey-rate-limiter'
import { claimEmbeddingQuotaLease } from './embedding-creation-quota-lease.mts'

const reservationKey = 'embedding-creation-cooldown-fixture'
const cooldownKey = 'background-cpu:provider-cooldown:{gemini-embeddings:creation}'

/** Coordinate the shared marker independently of global quota/configuration ownership. */
export async function acquireEmbeddingCreationCooldown(signal: AbortSignal) {
  let client: PoolClient | undefined
  let acquired = false
  let lease: Awaited<ReturnType<typeof claimEmbeddingQuotaLease>> | undefined
  let inspectionStarted = false
  let initiallyAbsent = false
  let witnessed = false
  let expiryAttempted = false
  let closing = false
  let disposal: Promise<void> | undefined
  const prepared = Promise.withResolvers<void>()
  const drains: Array<() => Promise<void>> = []
  const operations: Promise<unknown>[] = []
  const assertOpen = () => {
    if (closing || signal.aborted) throw new Error('Creation cooldown fixture is closing')
  }
  const close = () => {
    closing = true
    return (disposal ??= dispose())
  }
  onTestFinished(close)
  try {
    client = await jobSerializationPool.connect()
    assertOpen()
    await client.query(
      "/* acquireEmbeddingCreationCooldown:timeout */ SET statement_timeout = '5s'",
    )
    assertOpen()
    await client.query(
      '/* acquireEmbeddingCreationCooldown:lock */ SELECT pg_advisory_lock(hashtextextended($1, 0))',
      [reservationKey],
    )
    acquired = true
    assertOpen()
    lease = await claimEmbeddingQuotaLease(client, reservationKey)
    assertOpen()
    inspectionStarted = true
    if ((await rateLimiterValkeyClient.pttl(cooldownKey)) !== -2)
      throw new Error('Creation cooldown already exists before the owned writer starts')
    initiallyAbsent = true
    assertOpen()
  } catch (err) {
    prepared.resolve()
    const [disposed] = await Promise.allSettled([close()])
    if (disposed?.status === 'rejected')
      throw new AggregateError([err, disposed.reason], 'Cooldown acquisition and cleanup failed', {
        cause: err,
      })
    throw err
  }
  prepared.resolve()
  function start<T>(action: () => Promise<T>): Promise<T> {
    assertOpen()
    const operation = Promise.resolve().then(action)
    operations.push(operation)
    void operation.catch(() => undefined)
    return operation
  }
  async function expireOwnedMarker() {
    const remaining = await rateLimiterValkeyClient.pttl(cooldownKey)
    if (remaining === -2) {
      expiryAttempted = true
      return
    }
    if (!witnessed || expiryAttempted || remaining === -1)
      throw new Error('Creation cooldown ownership cannot be established')
    expiryAttempted = true
    await rateLimiterValkeyClient.pexpire(cooldownKey, 0)
  }
  return {
    close,
    beforeRelease: (drain: () => Promise<void>) => {
      assertOpen()
      drains.push(drain)
    },
    witnessOwnWrite: () =>
      start(async () => {
        if ((await rateLimiterValkeyClient.pttl(cooldownKey)) <= 0)
          throw new Error('Owned creation writer did not persist its cooldown')
        witnessed = true
      }),
    expire: () =>
      start(async () => {
        if (!witnessed) throw new Error('Creation cooldown has no owned write witness')
        await expireOwnedMarker()
      }),
    promote: (job: Pick<Job, 'promote' | 'getState'>, completed: Promise<unknown>) =>
      start(async () => {
        try {
          await job.promote()
        } catch (err) {
          const state = await job.getState()
          if (state !== 'waiting' && state !== 'active' && state !== 'completed') throw err
          await completed
        }
      }),
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
    // Unknown or unsafe drains retain the durable witness even after this session exits.
    for (const drain of drains) await attempt(drain)
    for (const operation of operations) await attempt(() => operation)
    if (!errors.length && (!inspectionStarted || initiallyAbsent)) {
      if (initiallyAbsent) {
        await attempt(expireOwnedMarker)
        if (!errors.length)
          await attempt(async () => {
            if ((await rateLimiterValkeyClient.pttl(cooldownKey)) !== -2)
              throw new Error('Creation cooldown remained or reappeared after owned cleanup')
          })
      }
      if (!errors.length) await attempt(() => lease?.removeAfterRestoration())
    }
    if (acquired) await attempt(() => unlockCooldownReservation(client!))
    await attempt(() => client && resetCooldownTimeout(client))
    await attempt(() =>
      client?.release(
        errors.length
          ? new AggregateError(errors, 'Cooldown disposal failed', { cause: errors[0] })
          : undefined,
      ),
    )
    if (errors.length)
      throw new AggregateError(errors, 'Creation cooldown fixture teardown failed', {
        cause: errors[0],
      })
  }
}

async function unlockCooldownReservation(ownedClient: PoolClient) {
  const { rows } = await ownedClient.query<{ unlocked: boolean }>(
    '/* unlockCooldownReservation */ SELECT pg_advisory_unlock(hashtextextended($1, 0)) AS unlocked',
    [reservationKey],
  )
  if (!rows[0]?.unlocked) throw new Error('Creation cooldown reservation was not released')
}

function resetCooldownTimeout(ownedClient: PoolClient) {
  return ownedClient.query('/* resetCooldownTimeout */ RESET statement_timeout')
}
