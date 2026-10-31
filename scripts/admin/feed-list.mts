export type FeedList = {
  name: string
  url: string
  youtube: boolean
}

const CONCURRENCY = 4
const MAX_RETRIES = 5
const MAX_WAIT_MS = 120_000

export function httpUrl(value: string): string | null {
  if (!value || value.includes('\u001f')) return null
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? value : null
  } catch {
    return null
  }
}

export function feedUrl(line: string, youtube: boolean): string | null {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) return null
  if (!youtube) return httpUrl(trimmed)
  const splitAt = trimmed.indexOf(' # ')
  const name = trimmed.slice(splitAt + 3).trim()
  if (splitAt === -1 || !name) return null
  const candidate = httpUrl(trimmed.slice(0, splitAt).trim())
  if (!candidate || !new URL(candidate).searchParams.get('channel_id')) return null
  return candidate
}

export async function readList(list: FeedList, limit: number | undefined): Promise<string[]> {
  const response = await fetch(list.url)
  if (!response.ok) throw new Error(`${list.name} list returned ${response.status}`)
  const urls: string[] = []
  for (const line of (await response.text()).split('\n')) {
    const url = feedUrl(line, list.youtube)
    if (!url) continue
    urls.push(url)
    if (limit !== undefined && urls.length >= limit) break
  }
  return urls
}

function retryDelayMs(header: string | null): number {
  const seconds = Number(header)
  if (header && Number.isFinite(seconds) && seconds >= 0)
    return Math.min(seconds * 1000, MAX_WAIT_MS)
  const when = header ? Date.parse(header) : Number.NaN
  if (!header || Number.isNaN(when)) return 1000
  return Math.min(Math.max(when - Date.now(), 0), MAX_WAIT_MS)
}

async function postFeed(
  endpoint: string,
  feed: string,
  cookie: string,
  userAgent: string,
  attempt = 0,
): Promise<boolean> {
  let response: Response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie, 'user-agent': userAgent },
      body: JSON.stringify({ rss_feed_url: feed, follow: false }),
    })
  } catch (err) {
    console.error(`${feed} ${err instanceof Error ? err.message : 'network error'}`)
    return false
  }
  if (response.ok) return true
  if (response.status !== 429 || attempt === MAX_RETRIES) {
    console.error(`${feed} ${response.status}`)
    return false
  }
  await new Promise(resolve => {
    setTimeout(resolve, retryDelayMs(response.headers.get('retry-after')))
  })
  return postFeed(endpoint, feed, cookie, userAgent, attempt + 1)
}

export async function postAll(
  endpoint: string,
  feeds: readonly string[],
  cookie: string,
  userAgent: string,
) {
  const width = Math.min(CONCURRENCY, feeds.length)
  const lanes = Array.from({ length: width }, () => [] as string[])
  for (const [index, feed] of feeds.entries()) lanes[index % width]?.push(feed)
  const counts = await Promise.all(
    lanes.map(async lane => {
      let submitted = 0
      let failed = 0
      await lane.reduce(async (previous, feed) => {
        await previous
        if (await postFeed(endpoint, feed, cookie, userAgent)) submitted += 1
        else failed += 1
      }, Promise.resolve())
      return { submitted, failed }
    }),
  )
  return counts.reduce(
    (sum, count) => ({
      submitted: sum.submitted + count.submitted,
      failed: sum.failed + count.failed,
    }),
    { submitted: 0, failed: 0 },
  )
}
