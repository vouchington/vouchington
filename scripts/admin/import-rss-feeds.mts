/**
 * Submit a named public feed list through POST /api/v1/rss-feeds.
 * `kagi` is one source: three list URLs and how each line becomes a feed URL.
 * Copy VOUCHA_SESSION_DT, VOUCHA_SESSION_ST, and VOUCHA_USER_AGENT from a logged-in browser.
 */
const LIST = 'https://raw.githubusercontent.com/kagisearch/smallweb/main'
const SOURCES = {
  kagi: [
    { name: 'smallweb', url: `${LIST}/smallweb.txt`, youtube: false },
    { name: 'smallcomic', url: `${LIST}/smallcomic.txt`, youtube: false },
    { name: 'smallyt', url: `${LIST}/smallyt.txt`, youtube: true },
  ],
} as const

type SourceName = keyof typeof SOURCES
type ListDef = (typeof SOURCES)[SourceName][number]
const CONCURRENCY = 4
const MAX_RETRIES = 5
const MAX_WAIT_MS = 120_000

function helpText(): string {
  return [
    'Usage: node scripts/admin/import-rss-feeds.mts <source> [--base-url URL] [--limit N] [--dry-run]',
    `Sources: ${Object.keys(SOURCES).join(', ')}`,
    '--base-url   Voucha origin. Required unless --dry-run.',
    '--limit N    Keep at most N feed URLs from each list.',
    '--dry-run    Print "<list> <feed url>" and do not call the Voucha API.',
    '--help, -h   Show this help.',
    'A live run sends Cookie and User-Agent from VOUCHA_SESSION_DT, VOUCHA_SESSION_ST,',
    'and VOUCHA_USER_AGENT. Copy all three from a logged-in browser.',
  ].join('\n')
}

function fail(message: string): never {
  console.error(`${helpText()}\n${message}`)
  process.exit(1)
}

function parseArgs(argv: string[]) {
  let source: string | undefined
  let baseUrl: string | undefined
  let limit: number | undefined
  let dryRun = false
  let help = false
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? ''
    if (arg === '--help' || arg === '-h') help = true
    else if (arg === '--dry-run') dryRun = true
    else if (arg === '--base-url') baseUrl = argv[(index += 1)]
    else if (arg === '--limit') limit = Number(argv[(index += 1)])
    else if (arg.startsWith('-')) fail(`Unknown flag ${arg}`)
    else if (source) fail(`Unexpected argument ${arg}`)
    else source = arg
  }
  if (help) return { dryRun, help, source: undefined, baseUrl, limit }
  if (!source || !(source in SOURCES)) fail(source ? `Unknown source ${source}` : 'Missing source')
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 0)) {
    fail('--limit must be a non-negative integer')
  }
  if (!dryRun && !baseUrl) fail('Missing --base-url')
  return { source: source as SourceName, baseUrl, limit, dryRun, help }
}

function httpUrl(value: string): string | null {
  if (!value || value.includes('\u001f')) return null
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? value : null
  } catch {
    return null
  }
}

function feedUrl(line: string, youtube: boolean): string | null {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) return null
  if (!youtube) return httpUrl(trimmed)
  const splitAt = trimmed.indexOf(' # ')
  if (splitAt === -1 || !trimmed.slice(splitAt + 3).trim()) return null
  const candidate = httpUrl(trimmed.slice(0, splitAt).trim())
  if (!candidate || !new URL(candidate).searchParams.get('channel_id')) return null
  return candidate
}

async function readList(list: ListDef, limit: number | undefined): Promise<string[]> {
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

async function postAll(
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

const args = parseArgs(process.argv.slice(2))
if (args.help || !args.source) console.log(helpText())
else {
  const seen = new Set<string>()
  const unique: string[] = []
  let alreadyExisted = 0
  const lists = SOURCES[args.source]
  const pages = await Promise.all(lists.map(list => readList(list, args.limit)))
  for (const [index, urls] of pages.entries()) {
    const list = lists[index]!
    for (const url of urls) {
      if (args.dryRun) console.log(`${list.name} ${url}`)
      if (seen.has(url)) alreadyExisted += 1
      else unique.push((seen.add(url), url))
    }
  }
  if (!args.dryRun) {
    const dt = process.env.VOUCHA_SESSION_DT
    const st = process.env.VOUCHA_SESSION_ST
    const userAgent = process.env.VOUCHA_USER_AGENT
    if (!dt || !st || !userAgent || !args.baseUrl) {
      fail('Set VOUCHA_SESSION_DT, VOUCHA_SESSION_ST, and VOUCHA_USER_AGENT')
    }
    const counts = await postAll(
      new URL('/api/v1/rss-feeds', args.baseUrl).toString(),
      unique,
      `dt=${dt}; st=${st}`,
      userAgent,
    )
    console.log(
      `submitted ${counts.submitted}\nalready existed ${alreadyExisted}\nfailed ${counts.failed}`,
    )
  }
}
