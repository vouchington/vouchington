import type { PoolClient } from '@data-stores/psql'
import type {
  createTestPostgresClientLoan,
  reserveTestPostgresObserver,
} from './postgres-client-loan.mts'
import type {
  getTestOwnedPostgresLock,
  TestOwnedPostgresWaitOptions,
} from './postgres-client-lock-identity.mts'

export type Deferred<Value> = ReturnType<typeof Promise.withResolvers<Value>>
export type TestPostgresClientLoan = ReturnType<typeof createTestPostgresClientLoan>

export type TestPostgresMultiWaitState = {
  token: object
  options: TestOwnedPostgresWaitOptions
  started: Promise<void>
  observerLoan?: ReturnType<typeof reserveTestPostgresObserver>
  setup?: ReturnType<typeof getTestOwnedPostgresLock>
  pendingConnect?: Promise<PoolClient>
  claimed?: boolean
  loan?: TestPostgresClientLoan
  operation?: Promise<unknown>
  witnessed: boolean
  cancelled: Deferred<never>
  captured: Deferred<TestPostgresClientLoan>
  holderRelease?: Promise<void>
  snapshot?: Promise<void>
}
