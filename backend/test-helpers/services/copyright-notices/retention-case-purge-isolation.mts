import { afterEach, beforeEach } from 'vitest'
import {
  acquireTestPostgresAdvisoryLock,
  type TestPostgresAdvisoryLock,
} from '../../postgres-advisory-lock.mts'

const LOCK_NAMESPACE = 1_129_333_329
const LOCK_KEY = 1
const LOCK_TIMEOUT = '25s'
const HOOK_TIMEOUT_MS = 30_000

/**
 * Production purge pages run SERIALIZABLE, so two pages for unrelated cases can still abort one
 * another with 40001 when PostgreSQL predicate-locks a whole small table or shared index page.
 * Every test that runs a purge page holds this lock shared, so those tests still overlap each
 * other. A test whose success path must finish a purge holds it exclusive, so no other test's
 * purge page is open meanwhile. Tests that force a conflict inside one test with two sessions
 * stay shared and keep covering the real contract. The lock is taken before the test body so its
 * wait never counts against the test's own timeout.
 */
export function useCopyrightCasePurgeIsolation(mode: 'shared' | 'exclusive'): void {
  let lock: TestPostgresAdvisoryLock | undefined
  // no-mistakes-timeout-reason: an exclusive holder waits for every open shared purge test to finish
  beforeEach(async () => {
    lock = await acquireTestPostgresAdvisoryLock({
      namespace: LOCK_NAMESPACE,
      key: LOCK_KEY,
      timeout: LOCK_TIMEOUT,
      mode,
    })
  }, HOOK_TIMEOUT_MS)
  afterEach(async () => {
    const held = lock
    lock = undefined
    await held?.release()
  })
}
