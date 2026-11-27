import { advisoryLockPool, jobSerializationPool, readPool, writePool } from '@data-stores/psql'
import {
  withTestOwnedPostgresWait as withPoolsOwnedPostgresWait,
  type TestOwnedPostgresWaitOptions as PoolsOwnedPostgresWaitOptions,
} from 'vouchington-tooling/postgres-test-faults'
import { getOptionalRequestClientInfo } from '../modules/request-client-info/index.mts'
import { testLockNoticeOptions } from './postgres-lock-notice-options.mts'

export type TestOwnedPostgresWaitOptions = Omit<
  PoolsOwnedPostgresWaitOptions,
  'pool' | 'observerPool' | 'notice' | 'isOwnedRequest'
> & { pool: 'advisory' | 'read' | 'write' | 'job-serialization' }

/** Bind an owned wait to Voucha's named pools, with an observer on a different pool. */
export function bindTestOwnedPostgresWait(
  options: TestOwnedPostgresWaitOptions,
): PoolsOwnedPostgresWaitOptions {
  const pool =
    options.pool === 'write'
      ? writePool
      : options.pool === 'read'
        ? readPool
        : options.pool === 'job-serialization'
          ? jobSerializationPool
          : advisoryLockPool
  return {
    ...options,
    pool,
    observerPool: options.pool === 'write' ? advisoryLockPool : writePool,
    isOwnedRequest: requestId => getOptionalRequestClientInfo()?.requestId === requestId,
    notice: testLockNoticeOptions,
  }
}

/** Observe every Promise checkout in this action or actual HTTP request until the target wait. */
export function withTestOwnedPostgresWait<Result>(
  options: TestOwnedPostgresWaitOptions,
  action: (waitForLock: (operation: Promise<unknown>) => Promise<void>) => Promise<Result>,
): Promise<Result> {
  return withPoolsOwnedPostgresWait(bindTestOwnedPostgresWait(options), action)
}
