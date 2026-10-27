import { advisoryLockPool, writePool, type PoolClient } from '@data-stores/psql'
import {
  observeTestAdvisoryLockNotice,
  observeTestTransactionLockNotice,
} from './postgres-advisory-lock-notice.mts'

import type {
  TestHeldPostgresLock,
  TestOwnedPostgresWaitOptions,
} from './postgres-client-lock-identity.mts'

/** Restore a real borrowed client's settings before its synchronous release reaches the pool. */
export function createTestPostgresClientLoan(client: PoolClient, lock: TestHeldPostgresLock) {
  const descriptor = Object.getOwnPropertyDescriptor(client, 'release')
  const release = client.release
  const observation =
    lock.kind === 'advisory'
      ? observeTestAdvisoryLockNotice(client, lock.tag)
      : observeTestTransactionLockNotice(client, lock.transactionId)
  const ended = trackTestPostgresClientEnd(client)
  let requested = false
  let finishing: Promise<void> | undefined
  const restoreRelease = () => {
    if (descriptor) Object.defineProperty(client, 'release', descriptor)
    else Reflect.deleteProperty(client, 'release')
  }
  function finish(receiver: PoolClient, args: Parameters<PoolClient['release']>) {
    return (finishing ??= (async () => {
      let restorationFailure: { reason: unknown } | undefined
      try {
        await observation.close()
      } catch (err) {
        restorationFailure = { reason: err }
      }
      restoreRelease()
      if (restorationFailure || args[0]) {
        Reflect.apply(release, receiver, restorationFailure ? [true] : args)
        await ended.promise
      } else {
        ended.close()
        Reflect.apply(release, receiver, args)
      }
      if (restorationFailure) throw restorationFailure.reason
    })())
  }
  Object.defineProperty(client, 'release', {
    configurable: true,
    enumerable: descriptor?.enumerable ?? true,
    writable: true,
    value: function (this: PoolClient, ...args: Parameters<PoolClient['release']>) {
      if (requested) throw new Error('Observed PostgreSQL client was released more than once')
      requested = true
      void finish(this, args).catch(() => {})
    },
  })
  return {
    ready: observation.ready,
    wait: observation.wait,
    async dispose() {
      if (!requested) {
        requested = true
        await finish(client, [true])
      } else await finishing
    },
  }
}

export function trackTestPostgresClientEnd(client: PoolClient) {
  const ended = Promise.withResolvers<void>()
  const onEnd = () => ended.resolve()
  client.once('end', onEnd)
  return { promise: ended.promise, close: () => client.off('end', onEnd) }
}

export async function discardTestPostgresClient(
  client: PoolClient,
  ended = trackTestPostgresClientEnd(client),
): Promise<void> {
  try {
    client.release(true)
    await ended.promise
  } finally {
    ended.close()
  }
}

/** Own the ordinary observer checkout, including a borrow that finishes during cleanup. */
export function reserveTestPostgresObserver(targetPool: TestOwnedPostgresWaitOptions['pool']) {
  const pool = targetPool === 'write' ? advisoryLockPool : writePool
  let client: PoolClient | undefined
  let ended: ReturnType<typeof trackTestPostgresClientEnd> | undefined
  let released: Promise<void> | undefined
  const ready = pool.connect().then(actual => {
    client = actual
    ended = trackTestPostgresClientEnd(actual)
    return actual
  })
  void ready.catch(() => {})
  return {
    ready,
    get client() {
      return client
    },
    release(discard: boolean) {
      return (released ??= (async () => {
        await ready.catch(() => undefined)
        if (!client) return
        if (discard) await discardTestPostgresClient(client, ended)
        else {
          ended?.close()
          client.release()
        }
      })())
    },
  }
}
