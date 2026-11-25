import { runCopyrightCasePurgePage } from '../../../services/copyright-notices/retention-case-purge-page.mts'
import { acquireTestPostgresAdvisoryLock } from '../../postgres-advisory-lock.mts'

const LOCK_NAMESPACE = 1_129_333_329
const LOCK_KEY = 1
const LOCK_TIMEOUT = '25s'

/**
 * Production purge pages run SERIALIZABLE, so two pages for unrelated cases can still abort one
 * another with 40001 when PostgreSQL predicate-locks a whole small table or shared index page.
 * The test database is shared by every parallel test, so tests that must finish a purge run each
 * page under one cross-process lock. A page is a single transaction, so the lock is held for
 * milliseconds. Conflicts a test forces itself with a second session happen inside the page and
 * still reach the production contract. Do not nest: a page inside this wrapper would wait on
 * itself.
 */
export async function withCopyrightCasePurgeIsolation<T>(run: () => Promise<T>): Promise<T> {
  const lock = await acquireTestPostgresAdvisoryLock({
    namespace: LOCK_NAMESPACE,
    key: LOCK_KEY,
    timeout: LOCK_TIMEOUT,
  })
  try {
    return await run()
  } finally {
    await lock.release()
  }
}

export function runIsolatedCopyrightCasePurgePage(
  ...args: Parameters<typeof runCopyrightCasePurgePage>
): ReturnType<typeof runCopyrightCasePurgePage> {
  return withCopyrightCasePurgeIsolation(() => runCopyrightCasePurgePage(...args))
}
