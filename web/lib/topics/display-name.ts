export function parseSourceTopicName(name: string): { title: string; url: string | null } {
  // Match terminated URL: "Title (https://...)" or "(https://...)" — greedy .* captures URLs with parens
  const terminatedMatch = /^(.*?)\s*\((https?:\/\/.*)\)\s*$/.exec(name)
  if (terminatedMatch) {
    return { title: terminatedMatch[1]!.trim(), url: terminatedMatch[2]! }
  }
  // Match truncated URL where closing paren was lost to 255-char truncation
  const truncatedMatch = /^(.*?)\s*\((https?:\/\/\S*)$/.exec(name)
  if (truncatedMatch) {
    return { title: truncatedMatch[1]!.trim(), url: truncatedMatch[2]! }
  }
  return { title: name, url: null }
}

export function getSourceKindLabel({
  url,
  feedType,
}: {
  url: string | null
  feedType?: 'article' | 'podcast' | 'video' | 'mixed'
}): string {
  if (url) {
    try {
      const { hostname } = new URL(url)
      if (
        hostname === 'youtube.com' ||
        hostname.endsWith('.youtube.com') ||
        hostname === 'youtu.be'
      ) {
        return 'YouTube Channel'
      }
    } catch {
      // invalid URL, fall through
    }
  }
  if (feedType === 'podcast') return 'Podcast'
  if (feedType === 'video') return 'Video'
  return 'News Source'
}

export function getTopicDisplayName(
  topic: { name: string; topic_type: string },
  options?: { feedType?: 'article' | 'podcast' | 'video' | 'mixed' },
): string {
  if (topic.topic_type !== 'rss_feed') return topic.name
  const { title, url } = parseSourceTopicName(topic.name)
  const label = getSourceKindLabel({ url, feedType: options?.feedType })
  return title ? `${title} (${label})` : `(${label})`
}

export function getTopicDisplayTitle(topic: { name: string; topic_type: string }): string {
  if (topic.topic_type !== 'rss_feed') return topic.name
  const { title } = parseSourceTopicName(topic.name)
  return title || getTopicDisplayName(topic)
}

interface RssFeedDisplayProps {
  title: string | null
  feed_type: 'article' | 'podcast' | 'video' | 'mixed'
  rss_feed_url: { url: string }
  home_page_url: { url: string } | null
  topic: { name: string; topic_type: string }
}

/**
 * Returns the display title for an RSS feed source, always including the kind-label suffix.
 * Example: "Planet Money (Podcast)", "Level1Techs (YouTube Channel)", "NPR (News Source)".
 * Uses the home_page_url host (or feed URL host as fallback) for YouTube detection, so
 * YouTube feeds show "(YouTube Channel)" regardless of feed_type.
 */
export function getRssFeedDisplayTitle(feed: RssFeedDisplayProps): string {
  const base = feed.title?.trim() || parseSourceTopicName(feed.topic.name).title || 'Untitled'
  const label = getSourceKindLabel({
    url: feed.home_page_url?.url ?? feed.rss_feed_url.url,
    feedType: feed.feed_type,
  })
  return `${base} (${label})`
}
