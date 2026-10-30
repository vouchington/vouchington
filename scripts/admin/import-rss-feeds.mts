/**
 * Submit a named public feed list through POST /api/v1/rss-feeds.
 * `kagi` is one source: three list URLs and how each line becomes a feed URL.
 * Copy VOUCHA_SESSION_DT, VOUCHA_SESSION_ST, and VOUCHA_USER_AGENT from a logged-in browser.
 */
import { postAll, readList, type FeedList } from './feed-list.mts'

const LIST = 'https://raw.githubusercontent.com/kagisearch/smallweb/main'
const SOURCES = {
  kagi: [
    { name: 'smallweb', url: `${LIST}/smallweb.txt`, youtube: false },
    { name: 'smallcomic', url: `${LIST}/smallcomic.txt`, youtube: false },
    { name: 'smallyt', url: `${LIST}/smallyt.txt`, youtube: true },
  ],
} as const satisfies Record<string, readonly FeedList[]>

type SourceName = keyof typeof SOURCES

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

const args = parseArgs(process.argv.slice(2))
if (args.help || !args.source) console.log(helpText())
else {
  const seen = new Set<string>()
  const unique: string[] = []
  let duplicatesSkipped = 0
  const lists = SOURCES[args.source]
  const pages = await Promise.all(lists.map(list => readList(list, args.limit)))
  for (const [index, urls] of pages.entries()) {
    const list = lists[index]!
    for (const url of urls) {
      if (args.dryRun) console.log(`${list.name} ${url}`)
      if (seen.has(url)) duplicatesSkipped += 1
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
      `submitted ${counts.submitted}\nduplicates skipped ${duplicatesSkipped}\nfailed ${counts.failed}`,
    )
  }
}
