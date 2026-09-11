export const HN_DISCUSSION_URL_LIMIT = 3

export function normalizeHnDiscussionUrl(raw: string): string | null {
  try {
    const url = new URL(raw)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    url.hash = ''
    url.hostname = url.hostname.toLowerCase()
    for (const key of Array.from(url.searchParams.keys())) {
      if (key.toLowerCase().startsWith('utm_')) url.searchParams.delete(key)
    }
    if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
      url.pathname = url.pathname.slice(0, -1)
    }
    return url.toString()
  } catch {
    return null
  }
}

export function collectHnDiscussionUrls(urls: Array<string | null | undefined>): string[] {
  const seen = new Set<string>()
  const collected: string[] = []
  for (const url of urls) {
    if (!url) continue
    const normalized = normalizeHnDiscussionUrl(url)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    collected.push(url)
    if (collected.length >= HN_DISCUSSION_URL_LIMIT) break
  }
  return collected
}
