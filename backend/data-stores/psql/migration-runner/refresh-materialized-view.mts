import { writePool } from '../setup.mts'
import onError from '@modules/on-error'

// Materialized views that may be refreshed via the psql `refreshMaterializedView` job.
// REFRESH MATERIALIZED VIEW is DDL and cannot use bind params, so the view name is
// validated against this allowlist before interpolation to prevent SQL injection.
const REFRESHABLE_MATERIALIZED_VIEWS = new Set(['mv_rss_feed_crawl_tiers', 'mv_top_hashtags'])

const MATERIALIZED_VIEW_ADVISORY_LOCK = 'refresh-materialized-view'

export async function refreshMaterializedView(viewName: string): Promise<void> {
  if (!REFRESHABLE_MATERIALIZED_VIEWS.has(viewName)) {
    throw new Error(`Materialized view is not refreshable: ${viewName}`)
  }
  const client = await writePool.connect()
  let hasMaterializedViewLock = false
  let released = false
  let refreshError: Error | undefined
  try {
    const lock = await client.query<{ locked: boolean }>(
      '/* refreshMaterializedView.tryAdvisoryLock */ SELECT pg_try_advisory_lock(hashtext($1)) AS locked',
      [MATERIALIZED_VIEW_ADVISORY_LOCK],
    )
    hasMaterializedViewLock = lock.rows[0]?.locked === true
    if (!hasMaterializedViewLock) {
      client.release()
      released = true
      throw new Error('Materialized view refresh contention; retryable')
    }
    // CONCURRENTLY requires a unique index and avoids locking readers during the refresh.
    try {
      await client.query(
        `/* refreshMaterializedView */ REFRESH MATERIALIZED VIEW CONCURRENTLY ${viewName}`,
      )
    } catch (error) {
      refreshError = toError(error)
    }

    let unlockError: Error | undefined
    try {
      if (hasMaterializedViewLock) {
        const unlock = await client.query<{ unlocked: boolean }>(
          '/* refreshMaterializedView.unlock */ SELECT pg_advisory_unlock(hashtext($1)) AS unlocked',
          [MATERIALIZED_VIEW_ADVISORY_LOCK],
        )
        if (!unlock.rows[0]?.unlocked) {
          unlockError = new Error('Materialized view advisory lock was not held at release')
        }
      }
    } catch (error) {
      unlockError = toError(error)
    }

    if (unlockError) {
      client.release(unlockError)
      released = true
      if (refreshError) {
        onError(unlockError)
        throw refreshError
      }
      throw unlockError
    }
    client.release()
    released = true
    if (refreshError) {
      throw refreshError
    }
  } catch (error) {
    if (!released) client.release(toError(error))
    throw toError(error)
  }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}
