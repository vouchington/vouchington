import { createReadStream, createWriteStream } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { finished, pipeline } from 'node:stream/promises'
import { runCommand } from '@modules/child-process'
import { readPool } from '@data-stores/psql'
import { to as copyTo } from 'pg-copy-streams'
import { iterateFeedListEntries, type FeedListSourceType, type ParsedFeedEntry } from './parse.mts'

const FIELD_SEPARATOR = '\u001f'
const SORT_BIN = '/usr/bin/sort'
const COMM_BIN = '/usr/bin/comm'
const DIFF_TIMEOUT_MS = 120_000

const KAGI_FEED_LIST_DIRECTORY_PREFIX = `kagi-feed-list-${process.pid}-`

export type FeedListChunkSource = {
  chunks: AsyncIterable<Uint8Array | string>
  sourceType: FeedListSourceType
}

type FeedListPage = {
  page: ParsedFeedEntry[]
  newEntries: ParsedFeedEntry[]
  total: number
}

export function createFeedListDirectory(): Promise<string> {
  return mkdtemp(join(tmpdir(), KAGI_FEED_LIST_DIRECTORY_PREFIX))
}

export function removeFeedListDirectory(directory: string): Promise<void> {
  return rm(directory, { recursive: true, force: true })
}

/** Stream every changed list once, keep the last entry per URL, and diff it against the reader. */
export async function prepareFeedListDiff(
  lists: readonly FeedListChunkSource[],
  directory: string,
): Promise<void> {
  const numbered = join(directory, 'numbered')
  await pipeline(Readable.from(numberedLines(lists)), createWriteStream(numbered))
  await sortAndDiff(numbered, directory)
}

/** Same diff for entries the caller already parsed. Later array entries win. */
export async function prepareParsedEntriesDiff(
  entries: readonly ParsedFeedEntry[],
  directory: string,
): Promise<void> {
  const numbered = join(directory, 'numbered')
  await pipeline(
    Readable.from(entries.map((entry, index) => numberedLine(entry, index + 1))),
    createWriteStream(numbered),
  )
  await sortAndDiff(numbered, directory)
}

/** One pass over the deduped file. `total` includes feeds the reader already has. */
export async function readFeedListPage(
  directory: string,
  cursor: string | undefined,
  pageSize: number,
): Promise<FeedListPage> {
  const dedupedLines = linesOf(join(directory, 'deduped'))
  const added = linesOf(join(directory, 'added'))
  let pending = await added.next()
  const page: ParsedFeedEntry[] = []
  const newEntries: ParsedFeedEntry[] = []
  let total = 0
  try {
    for await (const line of dedupedLines) {
      const entry = entryFromLine(line)
      if (!entry || (cursor !== undefined && entry.feedUrl <= cursor)) continue
      total += 1
      // oxlint-disable-next-line no-await-in-loop -- sorted merge; the added cursor only moves forward
      while (!pending.done && pending.value < entry.feedUrl) pending = await added.next()
      if (page.length >= pageSize) continue
      page.push(entry)
      if (!pending.done && pending.value === entry.feedUrl) newEntries.push(entry)
    }
  } finally {
    await dedupedLines.return(undefined)
    await added.return(undefined)
  }
  return { page, newEntries, total }
}

async function sortAndDiff(numbered: string, directory: string): Promise<void> {
  const ordered = join(directory, 'ordered')
  const deduped = join(directory, 'deduped')
  const desired = join(directory, 'desired')
  const membership = join(directory, 'membership')
  const added = join(directory, 'added')
  await writeCommandOutput(SORT_BIN, ['-t', FIELD_SEPARATOR, '-k1,1', '-k2,2nr', numbered], ordered)
  await writeCommandOutput(SORT_BIN, ['-s', '-t', FIELD_SEPARATOR, '-u', '-k1,1', ordered], deduped)
  await pipeline(Readable.from(desiredLines(deduped)), createWriteStream(desired))
  await copyExistingFeedUrls(membership)
  // `comm -23` prints desired URLs the reader does not already have. Both files are C-ordered.
  await writeCommandOutput(COMM_BIN, ['-23', desired, membership], added)
  await Promise.all([numbered, ordered, desired, membership].map(path => rm(path, { force: true })))
}

async function* numberedLines(lists: readonly FeedListChunkSource[]): AsyncGenerator<string> {
  let lineNumber = 0
  for (const list of lists) {
    // oxlint-disable-next-line no-await-in-loop -- line numbers increase across the fixed source order
    for await (const entry of iterateFeedListEntries(list.chunks, list.sourceType)) {
      lineNumber += 1
      yield numberedLine(entry, lineNumber)
    }
  }
}

function numberedLine(entry: ParsedFeedEntry, lineNumber: number): string {
  const payload = JSON.stringify({
    name: entry.name,
    slug: entry.slug,
    sourceType: entry.sourceType,
  })
  return `${entry.feedUrl}${FIELD_SEPARATOR}${lineNumber}${FIELD_SEPARATOR}${payload}\n`
}

async function* desiredLines(deduped: string): AsyncGenerator<string> {
  for await (const line of linesOf(deduped)) {
    const separator = line.indexOf(FIELD_SEPARATOR)
    if (separator !== -1) yield `${line.slice(0, separator)}\n`
  }
}

// Two readline interfaces in one process drop the second file's lines, so split chunks here.
async function* linesOf(path: string): AsyncGenerator<string> {
  const stream = createReadStream(path)
  let pending = ''
  try {
    for await (const chunk of stream) {
      pending += Buffer.from(chunk).toString('utf8')
      let newline = pending.indexOf('\n')
      while (newline !== -1) {
        yield pending.slice(0, newline)
        pending = pending.slice(newline + 1)
        newline = pending.indexOf('\n')
      }
    }
    if (pending.length > 0) yield pending
  } finally {
    stream.destroy()
  }
}

function entryFromLine(line: string): ParsedFeedEntry | null {
  const first = line.indexOf(FIELD_SEPARATOR)
  const second = first === -1 ? -1 : line.indexOf(FIELD_SEPARATOR, first + 1)
  if (second === -1) return null
  const payload = JSON.parse(line.slice(second + 1)) as {
    name: string
    slug: string
    sourceType: FeedListSourceType
  }
  return { feedUrl: line.slice(0, first), ...payload }
}

async function copyExistingFeedUrls(destination: string): Promise<void> {
  const client = await readPool.connect()
  try {
    const copy = client.query(
      copyTo(
        `/* copyExistingFeedUrls */
        COPY (
          SELECT urls.url FROM urls
          WHERE EXISTS (
            SELECT 1 FROM rss_feeds
            WHERE rss_feeds.rss_feed_url_id = urls.id AND rss_feeds.deleted_at IS NULL
          )
          ORDER BY urls.url COLLATE "C"
        ) TO STDOUT`,
      ),
    )
    await pipeline(copy, createWriteStream(destination))
  } finally {
    client.release()
  }
}

async function writeCommandOutput(
  command: string,
  args: readonly string[],
  destination: string,
): Promise<void> {
  const output = createWriteStream(destination)
  try {
    await runCommand({ command, args, stdout: output, timeoutMs: DIFF_TIMEOUT_MS })
    await finished(output)
  } catch (err) {
    output.destroy()
    throw err
  }
}
