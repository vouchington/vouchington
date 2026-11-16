import { isPublicRssFeedUrl } from '@services/rss-feeds/url-validation'

const VALID_FEED_TYPES = new Set(['article', 'podcast', 'video', 'mixed'])

export function validateRssFeedFields(row: Record<string, string>): string[] {
  const topicType = row.topic_type?.trim()
  const rssFeedUrl = row.rss_feed_url?.trim()
  const rssFeedTitle = row.rss_feed_title?.trim()
  const feedType = row.feed_type?.trim()
  const isRssFeed = topicType === 'rss_feed'

  return [
    ...(rssFeedUrl && !isRssFeed
      ? ['rss_feed_url is only allowed for topic_type=rss_feed']
      : rssFeedUrl && !isPublicRssFeedUrl(rssFeedUrl)
        ? ['rss_feed_url must be a valid URL']
        : []),
    ...(rssFeedTitle && !isRssFeed
      ? ['rss_feed_title is only allowed for topic_type=rss_feed']
      : []),
    ...(feedType && !isRssFeed
      ? ['feed_type is only allowed for topic_type=rss_feed']
      : feedType && !VALID_FEED_TYPES.has(feedType)
        ? [`feed_type must be one of: ${[...VALID_FEED_TYPES].join(', ')}`]
        : []),
    ...(isRssFeed ? validateRequiredRssFeedFields(row) : []),
  ]
}

function validateRequiredRssFeedFields(row: Record<string, string>): string[] {
  const nameTrimmed = row.name?.trim()
  return [
    ...(row.rss_feed_url?.trim() ? [] : ['rss_feed_url is required for topic_type=rss_feed']),
    ...(row.rss_feed_title?.trim() ? [] : ['rss_feed_title is required for topic_type=rss_feed']),
    ...(row.parent_slugs?.trim() ? [] : ['parent_slugs is required for topic_type=rss_feed']),
    ...(nameTrimmed ? [] : ['name is required for topic_type=rss_feed']),
    ...(nameTrimmed && /\(https?:\/\//.test(nameTrimmed)
      ? [
          'rss_feed topic name must be the base title without a URL suffix (URL is appended automatically)',
        ]
      : []),
  ]
}
