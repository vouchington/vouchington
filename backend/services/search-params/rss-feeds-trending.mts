import createHttpError from 'http-errors'

export const RSS_FEED_SORTS = ['trending'] as const
export const RSS_FEED_TIME_RANGES = ['day', 'week', 'month'] as const

const TRENDING_EXCLUSIVE_FILTERS = [
  'q',
  'text_search_query',
  'topic',
  'topics',
  'topic_match',
  'include_descendants',
  'publisher_type',
  'publisher_types',
  'publisher_type_match',
  'enabled',
  'discoverable',
  'feed_type',
  'category',
] as const

/**
 * Trending reads the day, week or month ranking of mv_trending_rss_feeds, which holds only
 * enabled, discoverable feeds and carries no topic, type or text columns. Combining it with
 * another filter would filter after the ranking scan instead of before the limit, so it refuses
 * them. time_range belongs to the trending sort alone.
 */
export function resolveTrendingOptions(prepared: {
  sort: unknown
  timeRange: unknown
  validationQuery: Record<string, unknown>
}): { sort?: (typeof RSS_FEED_SORTS)[number]; time_range?: (typeof RSS_FEED_TIME_RANGES)[number] } {
  if (prepared.sort !== 'trending') {
    if (prepared.timeRange !== undefined)
      throw createHttpError(400, 'time_range requires sort=trending')
    return {}
  }
  const filters = TRENDING_EXCLUSIVE_FILTERS.filter(
    name => prepared.validationQuery[name] !== undefined,
  )
  if (filters.length > 0)
    throw createHttpError(400, `sort=trending cannot be combined with ${filters.join(', ')}`)
  return {
    sort: 'trending',
    time_range: RSS_FEED_TIME_RANGES.find(range => range === prepared.timeRange) ?? 'week',
  }
}
