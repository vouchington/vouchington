import { AsyncLocalStorage } from 'node:async_hooks'
import { read, readPool, writePool } from '@data-stores/psql'

const observedRouting = new AsyncLocalStorage<symbol>()

/**
 * Observe real pool routing around a single agent invocation. Always release the listeners.
 * Counts only checkouts inside `run`: the pools are process-wide, and another file in this
 * worker can check out a replica while the listener is attached.
 */
export function observePostgresReadRoutingForTest() {
  let primaryAcquisitions = 0
  let replicaAcquisitions = 0
  const token = Symbol('postgres-read-routing')
  const inScope = () => observedRouting.getStore() === token
  const onPrimaryAcquire = () => {
    if (!inScope()) return
    primaryAcquisitions += 1
  }
  const onReplicaAcquire = () => {
    if (!inScope()) return
    replicaAcquisitions += 1
  }
  writePool.on('acquire', onPrimaryAcquire)
  readPool.on('acquire', onReplicaAcquire)

  return {
    primaryAcquisitions: () => primaryAcquisitions,
    replicaAcquisitions: () => replicaAcquisitions,
    run<T>(callback: () => Promise<T>): Promise<T> {
      return observedRouting.run(token, callback)
    },
    async probeReplicaRead() {
      await read('/* observePostgresReadRoutingForTest */ SELECT 1')
    },
    // A checkout signal that did not come from this invocation. The listener must ignore it.
    emitUnscopedReplicaAcquire() {
      readPool.emit('acquire', undefined)
    },
    close() {
      writePool.off('acquire', onPrimaryAcquire)
      readPool.off('acquire', onReplicaAcquire)
    },
  }
}
