import { advisoryLockPool, write, type QueryExecutor } from '@data-stores/psql'
import {
  createPostgresLockObservers,
  type QueryExecutor as LockObserverExecutor,
} from 'vouchington-tooling/postgres-test-faults'

export const {
  getTestPostgresBackendProcessId,
  getTestPostgresAdvisoryLockHolderProcessId,
  waitForTestPostgresLockWaiter,
  waitForTestPostgresBlockedLockChain,
} = createPostgresLockObservers({
  write: postgresLockQuery(write),
  advisoryLockPool: <Row extends object>(query: Parameters<LockObserverExecutor>[0]) =>
    advisoryLockPool.query<Row>(query),
})

/** Preserve the application's annotated-query adapter when tooling supplies a plain query config. */
export function postgresLockQuery(executor: QueryExecutor): LockObserverExecutor {
  return <Row extends object>(query: Parameters<LockObserverExecutor>[0]) =>
    executor<Row>(query.text, query.values)
}
