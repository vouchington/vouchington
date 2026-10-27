import { createWriteStream } from 'node:fs'
import { lstat, mkdtemp, readdir, rm, utimes } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { iterateFeedListEntries, type FeedListSourceType, type ParsedFeedEntry } from './parse.mts'
import { entryFromLine, feedUrlFromLine, linesOf, numberedLine } from './feed-list-lines.mts'
import { sortAndDiff } from './feed-list-sort.mts'

const FEED_LIST_DIRECTORY_PREFIX = 'kagi-feed-list-'
const FEED_LIST_RUN_DIRECTORY = /^kagi-feed-list-\d+-/
export const FEED_LIST_DIRECTORY_MAX_AGE_MS = 60 * 60 * 1000

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
  return mkdtemp(join(tmpdir(), `${FEED_LIST_DIRECTORY_PREFIX}${process.pid}-`))
}

/** Drop feed-list directories older than one hour. A live job refreshes the directory mtime. */
export async function sweepExpiredFeedListDirectories(now = Date.now()): Promise<void> {
  const names = await readdir(tmpdir())
  await Promise.all(
    names.map(async name => {
      if (!isFeedListRunDirectory(name)) return
      const directory = join(tmpdir(), name)
      let info: Awaited<ReturnType<typeof lstat>>
      try {
        info = await lstat(directory)
      } catch (err) {
        if (isMissingFile(err)) return
        throw err
      }
      if (!info.isDirectory()) return
      if (now - info.mtimeMs > FEED_LIST_DIRECTORY_MAX_AGE_MS)
        await removeFeedListDirectory(directory)
    }),
  )
}

export async function removeFeedListDirectory(directory: string): Promise<void> {
  const resolved = resolve(directory)
  const fromRoot = relative(resolve(tmpdir()), resolved)
  const name = fromRoot.split(/[/\\]/)[0] ?? ''
  if (
    fromRoot.length === 0 ||
    fromRoot.startsWith('..') ||
    isAbsolute(fromRoot) ||
    !isFeedListRunDirectory(name)
  ) {
    throw new Error('feed list directory is outside the temporary run prefix')
  }
  await rm(resolved, { recursive: true, force: true })
}

function isFeedListRunDirectory(name: string): boolean {
  return FEED_LIST_RUN_DIRECTORY.test(name)
}

/** Stream every changed list once, keep the last entry per URL, and diff it against the reader. */
export async function prepareFeedListDiff(
  lists: readonly FeedListChunkSource[],
  directory: string,
): Promise<void> {
  await touchFeedListDirectory(directory)
  await writeNumberedFeedList(lists, directory)
}

async function writeNumberedFeedList(
  lists: readonly FeedListChunkSource[],
  directory: string,
): Promise<void> {
  const numbered = join(directory, 'numbered')
  await pipeline(Readable.from(numberedLines(lists)), createWriteStream(numbered))
  await diffFeedList(numbered, directory)
}

async function diffFeedList(numbered: string, directory: string): Promise<void> {
  await sortAndDiff(numbered, directory)
  await touchFeedListDirectory(directory)
}

/** One pass over the deduped file. `total` includes feeds the reader already has. */
export async function readFeedListPage(
  directory: string,
  cursor: string | undefined,
  pageSize: number,
): Promise<FeedListPage> {
  await touchFeedListDirectory(directory)
  const dedupedLines = linesOf(join(directory, 'deduped'))
  const added = linesOf(join(directory, 'added'))
  let pending = await added.next()
  const page: ParsedFeedEntry[] = []
  const newEntries: ParsedFeedEntry[] = []
  let total = 0
  try {
    for await (const line of dedupedLines) {
      const feedUrl = feedUrlFromLine(line)
      if (feedUrl === null || (cursor !== undefined && compareUtf8(feedUrl, cursor) <= 0)) continue
      total += 1
      while (!pending.done && compareUtf8(pending.value, feedUrl) < 0)
        // oxlint-disable-next-line no-await-in-loop -- each advance depends on the preceding line
        pending = await added.next()
      if (page.length >= pageSize) continue
      const entry = entryFromLine(line)
      if (!entry) continue
      page.push(entry)
      if (!pending.done && compareUtf8(pending.value, feedUrl) === 0) newEntries.push(entry)
    }
  } finally {
    await dedupedLines.return(undefined)
    await added.return(undefined)
  }
  return { page, newEntries, total }
}

async function touchFeedListDirectory(directory: string): Promise<void> {
  const now = new Date()
  await utimes(directory, now, now)
}

function isMissingFile(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === 'ENOENT'
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
