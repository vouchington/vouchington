import { isPublicRssFeedUrl } from '@services/rss-feeds/url-validation'

const VALID_FEED_TYPES = new Set(['article', 'podcast', 'video', 'mixed'])

export function validateRssFeedFields(row: Record<string, string>, errors: string[]): void {
  const topicType = row.topic_type?.trim()
  const rssFeedUrl = row.rss_feed_url?.trim()
  const rssFeedTitle = row.rss_feed_title?.trim()
  const feedType = row.feed_type?.trim()

  if (rssFeedUrl && topicType !== 'rss_feed') {
    errors.push('rss_feed_url is only allowed for topic_type=rss_feed')
  } else if (rssFeedUrl && !isPublicRssFeedUrl(rssFeedUrl)) {
    errors.push('rss_feed_url must be a valid URL')
  }
  if (rssFeedTitle && topicType !== 'rss_feed') {
    errors.push('rss_feed_title is only allowed for topic_type=rss_feed')
  }
  if (feedType && topicType !== 'rss_feed') {
    errors.push('feed_type is only allowed for topic_type=rss_feed')
  } else if (feedType && !VALID_FEED_TYPES.has(feedType)) {
    errors.push(`feed_type must be one of: ${[...VALID_FEED_TYPES].join(', ')}`)
  }
  if (topicType === 'rss_feed') validateRequiredRssFeedFields(row, errors)
}

function validateRequiredRssFeedFields(row: Record<string, string>, errors: string[]): void {
  if (!row.rss_feed_url?.trim()) errors.push('rss_feed_url is required for topic_type=rss_feed')
  if (!row.rss_feed_title?.trim()) errors.push('rss_feed_title is required for topic_type=rss_feed')
  if (!row.parent_slugs?.trim()) errors.push('parent_slugs is required for topic_type=rss_feed')
  const nameTrimmed = row.name?.trim()
  if (!nameTrimmed) errors.push('name is required for topic_type=rss_feed')
  if (nameTrimmed && /\(https?:\/\//.test(nameTrimmed)) {
    errors.push(
      'rss_feed topic name must be the base title without a URL suffix (URL is appended automatically)',
    )
  }
}
