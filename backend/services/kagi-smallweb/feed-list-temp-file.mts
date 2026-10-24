import { createWriteStream } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { iterateFeedListEntries, type FeedListSourceType, type ParsedFeedEntry } from './parse.mts'
import { entryFromLine, linesOf, numberedLine } from './feed-list-lines.mts'
import { sortAndDiff } from './feed-list-sort.mts'

const KAGI_FEED_LIST_DIRECTORY_PREFIX = `kagi-feed-list-${process.pid}-`

export type FeedListChunkSource = {
  chunks: Readable
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

export async function removeFeedListDirectory(directory: string): Promise<void> {
  const resolved = resolve(directory)
  const fromRoot = relative(resolve(tmpdir()), resolved)
  const name = fromRoot.split(/[/\\]/)[0] ?? ''
  if (
    fromRoot.length === 0 ||
    fromRoot.startsWith('..') ||
    isAbsolute(fromRoot) ||
    !name.startsWith(KAGI_FEED_LIST_DIRECTORY_PREFIX)
  ) {
    throw new Error('feed list directory is outside the temporary run prefix')
  }
  await rm(resolved, { recursive: true, force: true })
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
      if (!entry || (cursor !== undefined && compareUtf8(entry.feedUrl, cursor) <= 0)) continue
      total += 1
      while (!pending.done && compareUtf8(pending.value, entry.feedUrl) < 0)
        // oxlint-disable-next-line no-await-in-loop -- each advance depends on the preceding line
        pending = await added.next()
      if (page.length >= pageSize) continue
      page.push(entry)
      if (!pending.done && compareUtf8(pending.value, entry.feedUrl) === 0) newEntries.push(entry)
    }
  } finally {
    await dedupedLines.return(undefined)
    await added.return(undefined)
  }
  return { page, newEntries, total }
}

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left), Buffer.from(right))
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
