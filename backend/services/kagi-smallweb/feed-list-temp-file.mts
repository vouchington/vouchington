import { createWriteStream } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { iterateFeedListEntries, type FeedListSourceType, type ParsedFeedEntry } from './parse.mts'
import { entryFromLine, linesOf, numberedLine } from './feed-list-lines.mts'
import { sortAndDiff } from './feed-list-sort.mts'

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
