import { read, readPool, withPrimaryReads, writePool } from '@data-stores/psql'
import { observePostgresReadRoutingForTest as observePoolsReadRouting } from 'vouchington-tooling/postgres-test-faults'

/**
 * Count successful checkouts requested inside `run`, even when another caller releases their
 * queued client. Observers share one wrapper per pool and release only their own audience.
 */
export async function observePostgresReadRoutingForTest(
  pools = { primary: writePool, replica: readPool },
) {
  const observer = await observePoolsReadRouting(pools)
  return {
    ...observer,
    runOnPrimary<T>(callback: () => Promise<T>): Promise<T> {
      return observer.run(() => withPrimaryReads(callback))
    },
    async probeReplicaRead() {
      await read('/* observePostgresReadRoutingForTest */ SELECT 1')
    },
  }
}
