import { VALID_RSS_POST_TYPES, isCatalogValue } from '@ts-shared/feed-capabilities'

export function buildTopicPostsRssUrl(
  topicSlug: string,
  searchParams: Record<string, string | string[] | undefined>,
): string {
  const base = `/rss/posts?topics=${encodeURIComponent(topicSlug)}`
  const raw = searchParams.post_types
  if (typeof raw !== 'string') return base
  const values = raw.split(',').filter(Boolean)
  if (values.length !== 1) return base
  const [type] = values
  if (!isCatalogValue(VALID_RSS_POST_TYPES, type)) return base
  return `${base}&post_type=${encodeURIComponent(type)}`
}
