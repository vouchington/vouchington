import { createSlugFromTitle } from '@modules/utils/slugs'

export type ParsedFeedEntry = {
  feedUrl: string
  name: string
  slug: string
  sourceType: 'web' | 'comic' | 'youtube'
}

export type FeedListSourceType = ParsedFeedEntry['sourceType']

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

/**
 * One list line, including a repeated URL. The file dedupe keeps the later entry; the array
 * parsers below keep the first so their existing fixtures stay stable.
 */
function parseFeedListLine(line: string, sourceType: FeedListSourceType): ParsedFeedEntry | null {
  const trimmed = line.trim()
  if (trimmed.length === 0 || trimmed.startsWith('#')) return null
  if (sourceType === 'youtube') return parseYouTubeLine(trimmed)
  if (!isValidUrl(trimmed) || trimmed.includes('\u001f')) return null
  const hostname = new URL(trimmed).hostname
  return { feedUrl: trimmed, name: hostname, slug: hostnameToSlug(hostname), sourceType }
}

function parseYouTubeLine(line: string): ParsedFeedEntry | null {
  const hashIndex = line.indexOf(' # ')
  if (hashIndex === -1) return null
  const url = line.slice(0, hashIndex).trim()
  if (!isValidUrl(url) || url.includes('\u001f')) return null
  const channelId = new URL(url).searchParams.get('channel_id')
  if (!channelId) return null
  const channelName = line.slice(hashIndex + 3).trim()
  if (!channelName) return null
  const slugBase = createSlugFromTitle(channelName)
  const channelSuffix = channelId.toLowerCase().replace(/[^a-z0-9-]/g, '')
  const slug = channelSuffix ? `${slugBase}-${channelSuffix}` : slugBase
  if (!slug) return null
  return { feedUrl: url, name: channelName, slug, sourceType: 'youtube' }
}

/** Yields every valid entry. Only the current partial line is buffered. */
export async function* iterateFeedListEntries(
  chunks: AsyncIterable<Uint8Array | string>,
  sourceType: FeedListSourceType,
): AsyncGenerator<ParsedFeedEntry> {
  let pending = ''
  for await (const chunk of chunks) {
    pending += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8')
    let newline = pending.indexOf('\n')
    while (newline !== -1) {
      const entry = parseFeedListLine(pending.slice(0, newline), sourceType)
      pending = pending.slice(newline + 1)
      if (entry) yield entry
      newline = pending.indexOf('\n')
    }
  }
  if (pending.length > 0) {
    const entry = parseFeedListLine(pending, sourceType)
    if (entry) yield entry
  }
}

function parseFeedListText(text: string, sourceType: FeedListSourceType): ParsedFeedEntry[] {
  const seen = new Set<string>()
  const entries: ParsedFeedEntry[] = []
  for (const line of text.split('\n')) {
    const entry = parseFeedListLine(line, sourceType)
    if (!entry || seen.has(entry.feedUrl)) continue
    seen.add(entry.feedUrl)
    entries.push(entry)
  }
  return entries
}

export function parseWebFeedList(text: string): ParsedFeedEntry[] {
  return parseFeedListText(text, 'web')
}

export function parseComicFeedList(text: string): ParsedFeedEntry[] {
  return parseFeedListText(text, 'comic')
}

export function parseYouTubeFeedList(text: string): ParsedFeedEntry[] {
  return parseFeedListText(text, 'youtube')
}

export function parseFeedList(text: string, sourceType: FeedListSourceType): ParsedFeedEntry[] {
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
