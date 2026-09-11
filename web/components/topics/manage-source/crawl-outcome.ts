export function extractFeedItemUrl(item: Record<string, unknown>, feedUrl: string): string | null {
  const link = typeof item['link'] === 'string' ? item['link'].trim() || null : null
  const urlField = typeof item['url'] === 'string' ? item['url'].trim() || null : null
  const linksArr = item['links']
  const hrefField =
    Array.isArray(linksArr) &&
    linksArr.length > 0 &&
    typeof linksArr[0] === 'object' &&
    linksArr[0] !== null
      ? typeof (linksArr[0] as Record<string, unknown>)['href'] === 'string'
        ? ((linksArr[0] as Record<string, unknown>)['href'] as string).trim() || null
        : null
      : null
  const raw = link ?? urlField ?? hrefField
  if (!raw) return null
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw
  try {
    const resolved = new URL(raw, feedUrl).href
    return resolved.startsWith('http://') || resolved.startsWith('https://') ? resolved : null
  } catch {
    return null
  }
}

export function responseCodeClass(code: number): string {
  if (code >= 200 && code < 300) return 'text-emerald-600 dark:text-emerald-400'
  if (code >= 400) return 'text-destructive dark:text-destructive'
  return 'text-yellow-600 dark:text-yellow-400'
}

export interface CrawlOutcome {
  kind: 'not_modified' | 'items' | 'success' | 'redirect' | 'error'
  tone: 'success' | 'warning' | 'error'
  count?: number
}

interface FeedData {
  items?: unknown[]
  entries?: unknown[]
}

export function computeCrawlOutcome(
  responseCode: number,
  feedData?: FeedData | null,
): CrawlOutcome {
  if (responseCode === 304) return { kind: 'not_modified', tone: 'warning' }
  if (responseCode >= 200 && responseCode < 300) {
    const items = feedData?.items ?? feedData?.entries
    if (Array.isArray(items)) {
      const count = items.length
      if (count === 0) return { kind: 'items', tone: 'warning', count }
      return { kind: 'items', tone: 'success', count }
    }
    return { kind: 'success', tone: 'success' }
  }
  if (responseCode >= 300 && responseCode < 400) return { kind: 'redirect', tone: 'warning' }
  return { kind: 'error', tone: 'error' }
}
