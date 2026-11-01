import { isHttpUrlWithoutFragment } from '../backend/modules/utils/urls.mts'

const VALID_FEED_TYPES = new Set(['article', 'podcast', 'video', 'mixed'])

export function appendFeedFieldFailures(
  failures: string[],
  file: string,
  row: Record<string, string>,
  slug: string,
  name: string,
): void {
  if (row.rss_feed_url && !isHttpUrlWithoutFragment(row.rss_feed_url)) {
    failures.push(`${file}: slug "${slug}" rss_feed_url is invalid`)
  }
  if (Boolean(row.rss_feed_url) !== Boolean(row.rss_feed_title)) {
    failures.push(`${file}: slug "${slug}" rss_feed_url and rss_feed_title must be paired`)
  }
  if (row.topic_type !== 'rss_feed' && (row.rss_feed_url?.trim() || row.rss_feed_title?.trim())) {
    failures.push(`${file}: slug "${slug}" (type=${row.topic_type}) has an rss feed field`)
  }
  appendRssFeedRequirements(failures, file, row, slug, name)
  appendFeedTypeFailure(failures, file, row, slug)
}

function appendRssFeedRequirements(
  failures: string[],
  file: string,
  row: Record<string, string>,
  slug: string,
  name: string,
): void {
  if (row.topic_type !== 'rss_feed') return
  if (!row.parent_slugs?.trim()) failures.push(`${file}: "${slug}" rss_feed missing parent_slugs`)
  if (!row.rss_feed_url?.trim()) failures.push(`${file}: "${slug}" rss_feed missing rss_feed_url`)
  if (!row.rss_feed_title?.trim()) {
    failures.push(`${file}: "${slug}" rss_feed missing rss_feed_title`)
  }
  if (name && /\(https?:\/\//.test(name)) {
    failures.push(`${file}: "${slug}" name "${name}" already contains a URL suffix`)
  }
}

function appendFeedTypeFailure(
  failures: string[],
  file: string,
  row: Record<string, string>,
  slug: string,
): void {
  const feedType = row.feed_type?.trim()
  if (!feedType) return
  if (row.topic_type !== 'rss_feed') {
    failures.push(
      `${file}: "${slug}" feed_type "${feedType}" set on non-rss_feed topic (type=${row.topic_type})`,
    )
    return
  }
  if (!VALID_FEED_TYPES.has(feedType)) {
    failures.push(
      `${file}: "${slug}" feed_type "${feedType}" is not one of ${[...VALID_FEED_TYPES].join(', ')}`,
    )
  }
}
