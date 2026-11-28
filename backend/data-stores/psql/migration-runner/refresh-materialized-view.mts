import onError from '@modules/on-error'
import { refreshMaterializedView as refreshPlatformMaterializedView } from '@vouchington/postgres/views'
import { beginTransaction, writePool } from '../setup.mts'
import { refreshRssFeedCrawlTiersInTransaction } from './sync-rss-feed-fetch-state-tiers.mts'

const REFRESH_ADVISORY_LOCK_KEY = 'refresh-materialized-view'

// Refresh is DDL, so the product's allowlist is injected before its name is interpolated.
const REFRESHABLE_MATERIALIZED_VIEWS = new Set([
  'mv_rss_feed_crawl_tiers',
  'mv_top_hashtags',
  'mv_platform_stats',
  'mv_trending_rss_feeds',
  'mv_trending_communities',
  'mv_trending_topics',
  'mv_revenue_memberships',
  'mv_revenue_changes',
  'mv_referral_program_link_counts',
])

export async function refreshMaterializedView(viewName: string): Promise<void> {
  if (viewName === 'mv_rss_feed_crawl_tiers') {
    await refreshRssFeedCrawlTiersAndSync()
    return
  }
  await refreshPlatformMaterializedView({
    pool: writePool,
    viewName,
    allowedViews: REFRESHABLE_MATERIALIZED_VIEWS,
    reportError: onError,
  })
}

async function refreshRssFeedCrawlTiersAndSync(): Promise<void> {
  await using tx = await beginTransaction()
  const lock = await tx<{ locked: boolean }>(
    '/* refreshMaterializedView.tryAdvisoryLock */ SELECT pg_try_advisory_xact_lock(hashtext($1)) AS locked',
    [REFRESH_ADVISORY_LOCK_KEY],
  )
  if (!lock.rows[0]?.locked) {
    throw new Error('Materialized view refresh contention; retryable')
  }
  await refreshRssFeedCrawlTiersInTransaction(tx)
  await tx.commit()
}
