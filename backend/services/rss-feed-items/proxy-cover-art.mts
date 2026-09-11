import type { ViewRssFeedItem } from './types.mts'
import { proxyRssFeedCoverArt } from '@modules/rss-feed-cover-art/proxy-cover-art'

/**
 * Proxy podcast_show.cover_art_url on both the primary and all source feeds of an item.
 * Returns the item unchanged when no cover art is present.
 */
export function proxyRssFeedItemCoverArt(item: ViewRssFeedItem): ViewRssFeedItem {
  const proxied = proxyRssFeedCoverArt(item.rss_feed)
  const proxiedSources = item.rss_feed_sources?.map(proxyRssFeedCoverArt)
  const sourcesChanged =
    proxiedSources != null && proxiedSources.some((s, i) => s !== item.rss_feed_sources![i])
  if (proxied === item.rss_feed && !sourcesChanged) return item
  return {
    ...item,
    rss_feed: proxied,
    ...(proxiedSources != null ? { rss_feed_sources: proxiedSources } : {}),
  }
}
