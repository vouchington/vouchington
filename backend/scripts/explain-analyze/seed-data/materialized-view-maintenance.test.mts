import { describe, expect, it } from 'vitest'
import { refreshExplainMaterializedViews } from './materialized-view-maintenance.mts'

describe('explain materialized view maintenance', () => {
  it('analyzes each refreshed view before the next capture', async () => {
    const calls: string[] = []
    await refreshExplainMaterializedViews(
      async view => {
        calls.push(`refresh:${view}`)
      },
      async statement => {
        calls.push(`analyze:${statement}`)
      },
    )

    expect(calls).toEqual([
      'refresh:mv_rss_feed_crawl_tiers',
      'analyze:/* refreshExplainMaterializedViews */ ANALYZE "mv_rss_feed_crawl_tiers"',
      'refresh:mv_platform_stats',
      'analyze:/* refreshExplainMaterializedViews */ ANALYZE "mv_platform_stats"',
      'refresh:mv_trending_rss_feeds',
      'analyze:/* refreshExplainMaterializedViews */ ANALYZE "mv_trending_rss_feeds"',
      'refresh:mv_revenue_memberships',
      'analyze:/* refreshExplainMaterializedViews */ ANALYZE "mv_revenue_memberships"',
      'refresh:mv_revenue_changes',
      'analyze:/* refreshExplainMaterializedViews */ ANALYZE "mv_revenue_changes"',
    ])
  })
})
