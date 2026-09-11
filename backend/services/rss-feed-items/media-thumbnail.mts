type FeedItem = Record<string, unknown>

/** Extract thumbnail URL from itunes image, media thumbnails, or media content */
export function extractThumbnail(item: FeedItem): string | null {
  const itunes = item.itunes as Record<string, unknown> | undefined
  if (typeof itunes?.image === 'string' && itunes.image.trim()) return itunes.image.trim()

  const media = item.media as Record<string, unknown> | undefined
  if (!media) return null

  const thumbnailUrl = firstThumbnailUrl(media.thumbnails)
  if (thumbnailUrl) return thumbnailUrl

  for (const group of mediaGroups(media)) {
    const groupThumbnailUrl = firstThumbnailUrl(group.thumbnails)
    if (groupThumbnailUrl) return groupThumbnailUrl
  }

  return null
}

function firstThumbnailUrl(value: unknown): string | null {
  if (!Array.isArray(value) || value.length === 0) return null
  const url = (value[0] as Record<string, unknown> | undefined)?.url
  return typeof url === 'string' && url.trim() ? url.trim() : null
}

function mediaGroups(media: Record<string, unknown>): Array<Record<string, unknown>> {
  const groupList: Array<Record<string, unknown>> = []
  const groups = media.groups as Array<Record<string, unknown>> | undefined
  if (Array.isArray(groups)) groupList.push(...groups)
  const singleGroup = media.group as Record<string, unknown> | undefined
  if (singleGroup) groupList.push(singleGroup)
  return groupList
}
