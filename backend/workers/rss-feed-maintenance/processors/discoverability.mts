import { evaluateRssFeedDiscoverability } from '@services/rss-feeds/evaluate-discoverability'

export function processEvaluateRssFeedDiscoverability(data: { rssFeedId?: unknown }) {
  const rssFeedId = data?.rssFeedId
  if (typeof rssFeedId !== 'string' || !rssFeedId)
    throw new Error('RSS feed discoverability job .rssFeedId is required')
  return evaluateRssFeedDiscoverability(rssFeedId)
}
