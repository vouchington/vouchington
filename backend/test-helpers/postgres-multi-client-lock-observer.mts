import { advisoryLockPool, writePool } from '@data-stores/psql'
import {
  createTestPostgresMultiWait as createPoolsMultiWait,
  type TestPostgresMultiWaitAction,
} from 'vouchington-tooling/postgres-test-faults'
import {
  bindTestOwnedPostgresWait,
  type TestOwnedPostgresWaitOptions,
} from './postgres-client-lock-observer.mts'

export type { TestPostgresMultiWaitAction }

/** Hold the process-wide pool observation lease while witnessing multiple real lock waits. */
export async function createTestPostgresMultiWait() {
  const waits = await createPoolsMultiWait([writePool, advisoryLockPool])
  return {
    start<Result>(options: TestOwnedPostgresWaitOptions, action: () => Promise<Result>) {
      return waits.start(bindTestOwnedPostgresWait(options), action)
    },
    [Symbol.asyncDispose]: () => waits[Symbol.asyncDispose](),
  }
}
