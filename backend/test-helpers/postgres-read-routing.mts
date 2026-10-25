import { AsyncLocalStorage } from 'node:async_hooks'
import { read, readPool, writePool } from '@data-stores/psql'
import { runPoolObservationExclusively } from 'vouchington-tooling/postgres-test-faults'

const observedRouting = new AsyncLocalStorage<symbol>()
type ObservedPool = typeof writePool
type PoolObservation = {
  listeners: Map<symbol, () => void>
  connect: ObservedPool['connect']
  originalDescriptor: PropertyDescriptor | undefined
}
const poolObservations = new WeakMap<ObservedPool, PoolObservation>()

/**
 * Count successful checkouts requested inside `run`, even when another caller releases their
 * queued client. Observers share one wrapper per pool and release only their own audience.
 */
export async function observePostgresReadRoutingForTest(
  pools = { primary: writePool, replica: readPool },
) {
  let primaryAcquisitions = 0
  let replicaAcquisitions = 0
  const token = Symbol('postgres-read-routing')
  let closed = false
  let closing: Promise<void> | undefined
  const [releasePrimary, releaseReplica] = await runPoolObservationExclusively(async () => {
    return [
      observePoolRequests(pools.primary, token, () => {
        if (!closed) primaryAcquisitions += 1
      }),
      observePoolRequests(pools.replica, token, () => {
        if (!closed) replicaAcquisitions += 1
      }),
    ] as const
  })

  return {
    primaryAcquisitions: () => primaryAcquisitions,
    replicaAcquisitions: () => replicaAcquisitions,
    run<T>(callback: () => Promise<T>): Promise<T> {
      return observedRouting.run(token, callback)
    },
    async probeReplicaRead() {
      await read('/* observePostgresReadRoutingForTest */ SELECT 1')
    },
    close() {
      closed = true
      closing ??= runPoolObservationExclusively(async () => {
        releasePrimary()
        releaseReplica()
      }).catch((err: unknown) => {
        // A rejected nested close must remain retryable after the competing instrumentation ends.
        closing = undefined
        throw err
      })
      return closing
    },
  }
}

function observePoolRequests(pool: ObservedPool, token: symbol, onAcquire: () => void) {
  let observation = poolObservations.get(pool)
  if (!observation) {
    const listeners = new Map<symbol, () => void>()
    const originalDescriptor = Object.getOwnPropertyDescriptor(pool, 'connect')
    const connect = new Proxy(pool.connect, {
      apply(target, receiver, args: unknown[]) {
        const requester = observedRouting.getStore()
        const acquired = () => {
          if (requester !== undefined) listeners.get(requester)?.()
        }
        const callback = args[0]
        if (typeof callback === 'function') {
          return Reflect.apply(target, receiver, [
            function (this: unknown, ...values: unknown[]) {
              if (values[0] == null && values[1] !== undefined) acquired()
              return Reflect.apply(callback, this, values)
            },
            ...args.slice(1),
          ])
        }
        const pending = Reflect.apply(target, receiver, args) as Promise<unknown>
        return pending.then(client => {
          acquired()
          return client
        })
      },
    })
    observation = { listeners, connect, originalDescriptor }
    Object.defineProperty(pool, 'connect', {
      configurable: true,
      enumerable: originalDescriptor?.enumerable ?? false,
      writable: true,
      value: connect,
    })
    poolObservations.set(pool, observation)
  }
  observation.listeners.set(token, onAcquire)
  const current = observation
  return () => {
    current.listeners.delete(token)
    if (current.listeners.size > 0) return
    if (pool.connect === current.connect) {
      if (current.originalDescriptor)
        Object.defineProperty(pool, 'connect', current.originalDescriptor)
      else Reflect.deleteProperty(pool, 'connect')
    }
    poolObservations.delete(pool)
  }
}
