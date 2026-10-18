import onError from '@modules/on-error'
import { refreshMaterializedView as refreshPlatformMaterializedView } from '@vouchington/postgres/views'
import { writePool } from '../setup.mts'

// Refresh is DDL, so the product's allowlist is injected before its name is interpolated.
const REFRESHABLE_MATERIALIZED_VIEWS = new Set([
  'mv_rss_feed_crawl_tiers',
  'mv_top_hashtags',
  'mv_platform_stats',
  'mv_trending_rss_feeds',
  'mv_revenue_memberships',
  'mv_revenue_changes',
])

export async function refreshMaterializedView(viewName: string): Promise<void> {
  await refreshPlatformMaterializedView({
    pool: writePool,
    viewName,
    allowedViews: REFRESHABLE_MATERIALIZED_VIEWS,
    reportError: onError,
  })
}
