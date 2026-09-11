type MediaType = 'article' | 'audio' | 'video'

/** Derive feed-level type from a set of item media types */
export function classifyFeedType(
  items: Array<{ media_type: MediaType }>,
): 'article' | 'podcast' | 'video' | 'mixed' {
  if (items.length === 0) return 'article'

  const types = new Set(items.map(item => item.media_type))

  if (types.size === 1 && types.has('article')) return 'article'
  if (types.size === 1 && types.has('audio')) return 'podcast'
  if (types.size === 1 && types.has('video')) return 'video'

  return 'mixed'
}
