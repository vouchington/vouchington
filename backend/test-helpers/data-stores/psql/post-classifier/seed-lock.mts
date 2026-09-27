import {
  acquireTestPostgresAdvisoryLock,
  type TestPostgresAdvisoryLock,
} from '@voucha/test-helpers/postgres-advisory-lock'

const LOCK_NAMESPACE = 1_447_904_068
const LOCK_KEY = 1

export function acquirePostClassifierSeedTestLock(): Promise<TestPostgresAdvisoryLock> {
  return acquireTestPostgresAdvisoryLock({
    namespace: LOCK_NAMESPACE,
    key: LOCK_KEY,
    timeout: '25s',
  })
}
