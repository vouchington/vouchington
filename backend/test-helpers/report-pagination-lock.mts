import {
  acquireTestPostgresAdvisoryLock,
  type TestPostgresAdvisoryLock,
} from './postgres-advisory-lock.mts'

const LOCK_NAMESPACE = 1_447_904_067
const LOCK_KEY = 1
const LOCK_TIMEOUT = '25s'

export function acquireReportPaginationTestLock(): Promise<TestPostgresAdvisoryLock> {
  return acquireTestPostgresAdvisoryLock({
    namespace: LOCK_NAMESPACE,
    key: LOCK_KEY,
    timeout: LOCK_TIMEOUT,
  })
}
