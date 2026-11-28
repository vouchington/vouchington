import {
  assertWhitelistedSqlIdentifier,
  type PoolClient,
  withTransactionOptions,
  writePool,
} from '@data-stores/psql'
import { refreshRssFeedCrawlTiersInTransaction } from '@data-stores/psql/migration-runner/sync-rss-feed-fetch-state-tiers'

const REFRESH_ADVISORY_LOCK_NAME = 'refresh-materialized-view'
const REFRESH_CONTENTION_MESSAGE = 'Materialized view refresh contention; retryable'
const MAX_CONTENTION_WAITS = 5

// Same names as refreshMaterializedView. Production still rejects contention; tests wait.
const REFRESHABLE_MATERIALIZED_VIEWS = new Set([
  'mv_referral_program_link_counts',
  'mv_rss_feed_crawl_tiers',
  'mv_top_hashtags',
  'mv_platform_stats',
  'mv_trending_rss_feeds',
  'mv_trending_communities',
  'mv_trending_topics',
  'mv_revenue_memberships',
  'mv_revenue_changes',
])

/** Wait on the shared refresh key, run `fn` while holding it, then release it. */
export async function withMaterializedViewRefreshLockHeldForTest<Result>(
  fn: (client: PoolClient) => Promise<Result>,
): Promise<Result> {
  const client = await writePool.connect()
  let locked = false
  let actionError: Error | undefined
  let unlockError: Error | undefined
  let result: Result | undefined
  try {
    await client.query(
      '/* refreshMaterializedViewForTest.lock */ SELECT pg_advisory_lock(hashtext($1))',
      [REFRESH_ADVISORY_LOCK_NAME],
    )
    locked = true
    result = await fn(client)
  } catch (err) {
    actionError = toError(err)
  } finally {
    if (locked) unlockError = await unlock(client)
    if (unlockError) client.release(unlockError)
    else client.release()
  }
  if (actionError) throw actionError
  if (unlockError) throw unlockError
  return result as Result
}

/** Returns true when `err` is the retryable advisory-lock contention error from a concurrent refresh. */
export function isRefreshContentionError(err: unknown): boolean {
  return err instanceof Error && err.message === REFRESH_CONTENTION_MESSAGE
}

/** Wait for a concurrent test holding the shared refresh advisory lock, then invoke `fn`. */
export async function runWithoutRefreshContentionForTest<Result>(
  fn: () => Promise<Result>,
): Promise<Result> {
  for (let attempt = 0; attempt < MAX_CONTENTION_WAITS; attempt += 1) {
    try {
      return await fn()
    } catch (err) {
      if (!isRefreshContentionError(err) || attempt === MAX_CONTENTION_WAITS - 1) throw err
      // Block on PostgreSQL's lock queue until the concurrent holder releases the lock.
      await withMaterializedViewRefreshLockHeldForTest(async () => {})
    }
  }
  throw new Error('Unreachable contention wait loop exit')
}

/** Wait on the shared refresh key, then refresh one allowlisted view. */
export async function refreshMaterializedViewForTest(viewName: string): Promise<void> {
  const quotedView = quoteAllowedView(viewName)
  await withMaterializedViewRefreshLockHeldForTest(async client => {
    if (viewName === 'mv_rss_feed_crawl_tiers') {
      await withTransactionOptions({ client }, tx => refreshRssFeedCrawlTiersInTransaction(tx))
    } else {
      await client.query(
        `/* refreshMaterializedViewForTest.refresh */ REFRESH MATERIALIZED VIEW CONCURRENTLY ${quotedView}`,
      )
    }
  })
}

function quoteAllowedView(viewName: string): string {
  const allowedView = assertWhitelistedSqlIdentifier(
    viewName,
    REFRESHABLE_MATERIALIZED_VIEWS,
    'materialized view',
  )
  return `"${allowedView}"`
}

async function unlock(client: PoolClient): Promise<Error | undefined> {
  try {
    const result = await client.query<{ unlocked: boolean }>(
      '/* refreshMaterializedViewForTest.unlock */ SELECT pg_advisory_unlock(hashtext($1)) AS unlocked',
      [REFRESH_ADVISORY_LOCK_NAME],
    )
    if (result.rows[0]?.unlocked) return undefined
    return new Error('Materialized view advisory lock was not held at release')
  } catch (err) {
    return toError(err)
  }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}
