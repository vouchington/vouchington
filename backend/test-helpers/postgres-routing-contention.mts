import { Pool, readPool, writePool } from '@data-stores/psql/runtime'
import { read } from '@data-stores/psql'
import { withPostgresPoolQueryFailureForTest } from './postgres-pool-query-failure.mts'
import { observePostgresReadRoutingForTest } from './postgres-read-routing.mts'

type Route = 'primary' | 'replica'

/** Owned one-client pools share the worktree database without occupying other tests' clients. */
export function createPostgresRoutingContentionForTest() {
  const pools = {
    primary: new Pool({ ...writePool.options, max: 1 }),
    replica: new Pool({ ...readPool.options, max: 1 }),
  }
  const releases = new Set<() => void>()
  const ended = new Set<Route>()
  const originalConnections = [pools.primary.connect, pools.replica.connect]
  return {
    observe: () => observePostgresReadRoutingForTest(pools),
    waiting: (route: Route) => pools[route].waitingCount,
    connectionMethodsRestored: () =>
      pools.primary.connect === originalConnections[0] &&
      pools.replica.connect === originalConnections[1] &&
      !Object.hasOwn(pools.primary, 'connect') &&
      !Object.hasOwn(pools.replica, 'connect'),
    async query(route: Route) {
      await pools[route].query('/* postgresRoutingContention */ SELECT 1')
    },
    async borrow(route: Route) {
      const client = await pools[route].connect()
      let released = false
      const release = () => {
        if (released) return
        released = true
        releases.delete(release)
        client.release()
      }
      releases.add(release)
      return release
    },
    async end(route: Route) {
      ended.add(route)
      await pools[route].end()
    },
    async close() {
      for (const release of releases) release()
      await Promise.all(
        (['primary', 'replica'] as const)
          .filter(route => !ended.has(route))
          .map(route => pools[route].end()),
      )
    },
  }
}

/** Reproduce actual competing helper restoration, with the fault owned by a separate async call. */
export async function closeRoutingObserverDuringPoolFaultForTest(
  mode: 'parallel' | 'nested' = 'parallel',
) {
  const originalConnections = [writePool.connect, readPool.connect]
  const observer = await observePostgresReadRoutingForTest()
  const started = Promise.withResolvers<void>()
  const proceed = Promise.withResolvers<void>()
  let nestedCloseError: unknown
  const fault = withPostgresPoolQueryFailureForTest('/* routingPoolFaultOverlap */', async () => {
    if (mode === 'nested') {
      try {
        await observer.close()
      } catch (err) {
        nestedCloseError = err
      }
    }
    started.resolve()
    await proceed.promise
    await read('/* routingPoolFaultOverlap */ SELECT 1')
  }).then(
    () => undefined,
    (err: unknown) => err,
  )
  try {
    await started.promise
    const closing = mode === 'parallel' ? observer.close() : Promise.resolve()
    proceed.resolve()
    const error = await fault
    await closing
    await observer.close()
    return {
      error,
      nestedCloseError,
      restored:
        writePool.connect === originalConnections[0] && readPool.connect === originalConnections[1],
    }
  } finally {
    proceed.resolve()
    await fault
    await observer.close()
  }
}
