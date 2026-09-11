import { classifyFeedType } from '@services/rss-feed-items/media-classify'
import { isYouTubeChannelFeedUrl } from '@modules/utils'
import { updateRssFeedById } from './update.mts'
import type { RssFeedToFetch } from './get-to-fetch.mts'

/**
 * Reclassifies the feed_type for a fetched feed based on its items' media types.
 * YouTube channel feed URLs always stay 'video' regardless of individual item types
 * (e.g. community posts without yt:videoId can appear as articles in the raw feed).
 */
export async function reclassifyRssFeedTypeIfNeeded(
  rssFeedId: string,
  rssFeed: Pick<RssFeedToFetch, 'url' | 'feed_type'>,
  validItems: ReadonlyArray<{ media_type?: string }>,
): Promise<void> {
  if (validItems.length === 0) return
  const detectedFeedType = isYouTubeChannelFeedUrl(rssFeed.url)
    ? 'video'
    : classifyFeedType(
        validItems.flatMap(item => {
          const mt = item.media_type
          if (mt === 'article' || mt === 'audio' || mt === 'video') return [{ media_type: mt }]
          return []
        }),
      )
  if (detectedFeedType !== rssFeed.feed_type) {
    await updateRssFeedById(rssFeedId, { feed_type: detectedFeedType })
  }
}
