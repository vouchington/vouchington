import { read, readPool, writePool } from '@data-stores/psql'

/** Observe real pool routing around a single agent invocation. Always release the listeners. */
export function observePostgresReadRoutingForTest() {
  let primaryAcquisitions = 0
  let replicaAcquisitions = 0
  const onPrimaryAcquire = () => {
    primaryAcquisitions += 1
  }
  const onReplicaAcquire = () => {
    replicaAcquisitions += 1
  }
  writePool.on('acquire', onPrimaryAcquire)
  readPool.on('acquire', onReplicaAcquire)

  return {
    primaryAcquisitions: () => primaryAcquisitions,
    replicaAcquisitions: () => replicaAcquisitions,
    async probeReplicaRead() {
      await read('/* observePostgresReadRoutingForTest */ SELECT 1')
    },
    close() {
      writePool.off('acquire', onPrimaryAcquire)
      readPool.off('acquire', onReplicaAcquire)
    },
  }
}
