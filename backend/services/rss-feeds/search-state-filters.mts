import sql from 'sql-template-strings'

/** null means no filter, as for the is_enabled and discoverable options of searchRssFeeds. */
export function feedStateFilters(is_enabled: boolean | null, discoverable: boolean | null) {
  const filters: ReturnType<typeof sql>[] = []
  if (is_enabled !== null) {
    filters.push(is_enabled ? sql`rss_feeds.is_enabled = TRUE` : sql`rss_feeds.is_enabled = FALSE`)
  }
  if (discoverable !== null) {
    filters.push(
      discoverable ? sql`rss_feeds.is_discoverable = TRUE` : sql`rss_feeds.is_discoverable = FALSE`,
    )
  }
  return filters
}
