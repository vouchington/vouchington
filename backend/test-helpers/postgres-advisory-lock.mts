import { writePool } from '@data-stores/psql'
import {
  acquireTestPostgresAdvisoryLock as acquirePoolAdvisoryLock,
  type AcquireTestPostgresAdvisoryLockOptions,
  type TestPostgresAdvisoryLock,
} from 'vouchington-tooling/postgres-test-faults'

export type { TestPostgresAdvisoryLock }

export function acquireTestPostgresAdvisoryLock(
  options: AcquireTestPostgresAdvisoryLockOptions,
): Promise<TestPostgresAdvisoryLock> {
  return acquirePoolAdvisoryLock(writePool, options)
}
