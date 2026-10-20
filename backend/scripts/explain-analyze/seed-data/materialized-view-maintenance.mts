// REFRESH replaces the heap and leaves column statistics empty. The views are
// refreshed after the seed's ANALYZE pass, so each one is analyzed again here.
// Otherwise equality on window_name uses default selectivity and the trending
// ranking index is planned as a small bitmap that reads the whole window.
const EXPLAIN_MATERIALIZED_VIEWS = [
  'mv_rss_feed_crawl_tiers',
  'mv_platform_stats',
  'mv_trending_rss_feeds',
  'mv_revenue_memberships',
  'mv_revenue_changes',
] as const

export async function refreshExplainMaterializedViews(
  refresh: (view: string) => Promise<void>,
  analyze: (statement: string) => Promise<unknown>,
): Promise<void> {
  for (const view of EXPLAIN_MATERIALIZED_VIEWS) {
    await refresh(view)
    await analyze(`/* refreshExplainMaterializedViews */ ANALYZE "${view.replaceAll('"', '""')}"`)
  }
}
