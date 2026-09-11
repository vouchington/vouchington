export const RSS_ITEM_PARAM = 'rss_item'
export const RSS_ITEM_HIDDEN_EVENT = 'rss-item-hidden'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function parseRssItemId(value?: string | null): { id: string } | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!UUID_RE.test(trimmed)) return null
  return { id: trimmed }
}

/** Builds the href that opens a podcast episode in the source modal. */
export function podcastEpisodeModalHref(episodeId: string): string {
  return `/podcast-episodes?${RSS_ITEM_PARAM}=${encodeURIComponent(episodeId)}`
}
