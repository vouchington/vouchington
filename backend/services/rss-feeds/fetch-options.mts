import type { RssFeedToFetch } from './get-to-fetch.mts'

export function buildRssFetchOptions(
  rssFeed: RssFeedToFetch,
  ttl: number,
  options: { canReplayFeedBody: boolean },
) {
  const headers: Record<string, string> = {}
  if (ttl > 0 && options.canReplayFeedBody && rssFeed.etag) {
    headers['If-None-Match'] = rssFeed.etag
  }
  if (ttl > 0 && options.canReplayFeedBody && rssFeed.last_modified_at) {
    headers['If-Modified-Since'] = rssFeed.last_modified_at.toUTCString()
  }
  return { headers }
}
