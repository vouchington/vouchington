import { createSlugFromTitle } from '@modules/utils/slugs'

export type ParsedFeedEntry = {
  feedUrl: string
  name: string
  slug: string
  sourceType: 'web' | 'comic' | 'youtube'
}

function isValidUrl(text: string): boolean {
  try {
    const url = new URL(text)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function hostnameToSlug(hostname: string): string {
  return hostname.replace(/\./g, '-').toLowerCase()
}

function parseLines(text: string): string[] {
  return text.split('\n').flatMap(line => {
    const trimmed = line.trim()
    return trimmed.length > 0 && !trimmed.startsWith('#') ? [trimmed] : []
  })
}

function parseHostnameFeedList(text: string, sourceType: 'web' | 'comic'): ParsedFeedEntry[] {
  const seen = new Set<string>()
  const entries: ParsedFeedEntry[] = []

  for (const line of parseLines(text)) {
    if (!isValidUrl(line)) continue
    const url = line
    if (seen.has(url)) continue
    seen.add(url)

    const hostname = new URL(url).hostname
    entries.push({
      feedUrl: url,
      name: hostname,
      slug: hostnameToSlug(hostname),
      sourceType,
    })
  }

  return entries
}

export function parseWebFeedList(text: string): ParsedFeedEntry[] {
  return parseHostnameFeedList(text, 'web')
}

export function parseComicFeedList(text: string): ParsedFeedEntry[] {
  return parseHostnameFeedList(text, 'comic')
}

export function parseYouTubeFeedList(text: string): ParsedFeedEntry[] {
  const seen = new Set<string>()
  const entries: ParsedFeedEntry[] = []

  for (const line of parseLines(text)) {
    const hashIndex = line.indexOf(' # ')
    if (hashIndex === -1) continue

    const url = line.slice(0, hashIndex).trim()
    if (!isValidUrl(url)) continue
    if (seen.has(url)) continue
    seen.add(url)

    const channelId = new URL(url).searchParams.get('channel_id')
    if (!channelId) continue

    const channelName = line.slice(hashIndex + 3).trim()
    if (!channelName) continue

    // Include channel_id in slug to avoid collisions from duplicate channel names
    const slugBase = createSlugFromTitle(channelName)
    const channelSuffix = channelId ? channelId.toLowerCase().replace(/[^a-z0-9-]/g, '') : ''
    const slug = channelSuffix ? `${slugBase}-${channelSuffix}` : slugBase
    if (!slug) continue

    entries.push({
      feedUrl: url,
      name: channelName,
      slug,
      sourceType: 'youtube',
    })
  }

  return entries
}

export function parseFeedList(
  text: string,
  sourceType: 'web' | 'comic' | 'youtube',
): ParsedFeedEntry[] {
  switch (sourceType) {
    case 'web':
      return parseWebFeedList(text)
    case 'comic':
      return parseComicFeedList(text)
    case 'youtube':
      return parseYouTubeFeedList(text)
    default: {
      const exhaustiveCheck: never = sourceType
      throw new Error(`Unsupported sourceType: ${exhaustiveCheck}`)
    }
  }
}
