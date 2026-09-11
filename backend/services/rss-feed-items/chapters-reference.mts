import { recordValue, stringValue } from './chapters-values.mts'

type ChapterReference = {
  url: string
  type: string | null
}

export function extractPodcastChaptersReference(
  item: Record<string, unknown>,
  feedUrl?: string,
): ChapterReference | null {
  const raw = findPodcastChaptersObject(item)
  const rawUrl = stringValue(raw?.url ?? raw?.href)
  if (!rawUrl) return null

  let url: URL
  try {
    url = feedUrl ? new URL(rawUrl, feedUrl) : new URL(rawUrl)
  } catch {
    return null
  }
  if (url.protocol !== 'https:') return null

  return {
    url: url.toString(),
    type: stringValue(raw?.type),
  }
}

function findPodcastChaptersObject(item: Record<string, unknown>): Record<string, unknown> | null {
  const podcast = recordValue(item.podcast)
  const podcastChapters = recordValue(podcast?.chapters)
  if (podcastChapters) return podcastChapters

  const namespaced = recordValue(item['podcast:chapters'])
  if (namespaced) return namespaced

  const chapters = recordValue(item.chapters)
  if (chapters && (chapters.url || chapters.href)) return chapters

  return null
}
