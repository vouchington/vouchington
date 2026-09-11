import type { NavIntentId } from './types'
import type { MessageKey } from '@ts-shared/ui-messages'
import type { ViewRssFeed } from '@/types/rss-feeds'

export interface FeedTypeNav {
  intent: NavIntentId
  listTitleKey: MessageKey
  listPath: string
}

const SOURCES_NAV: FeedTypeNav = {
  intent: 'web-search',
  listTitleKey: 'nav.sources',
  listPath: '/sources',
}

/**
 * Maps a source RSS feed_type to the breadcrumb/sidebar navigation context.
 * Non-discoverable feeds fall back to /sources (inclusive) since typed list pages
 * (/channels, /podcasts, /news-sources) all filter to discoverable=true.
 */
export function feedTypeNav(
  feedType: ViewRssFeed['feed_type'] | null | undefined,
  isDiscoverable = true,
): FeedTypeNav {
  if (!isDiscoverable) return SOURCES_NAV
  switch (feedType) {
    case 'video':
      return { intent: 'videos', listTitleKey: 'nav.channels', listPath: '/channels' }
    case 'podcast':
      return { intent: 'podcasts', listTitleKey: 'nav.podcasts', listPath: '/podcasts' }
    case 'mixed':
      return SOURCES_NAV
    default:
      return { intent: 'news', listTitleKey: 'nav.newsSources', listPath: '/news-sources' }
  }
}
