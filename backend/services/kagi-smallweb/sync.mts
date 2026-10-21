import { existsSync } from 'node:fs'
import { FEED_LIST_SOURCES } from './sources.mts'
import { fetchFeedList, forgetFeedListValidators, type FeedListRead } from './fetch-feed-list.mts'
import type { ParsedFeedEntry } from './parse.mts'
import { getKagiCandidateBatchSize, isKagiSmallWebImportEnabled } from './import-config.mts'
import { enqueueBulkProcessKagiFeeds } from '@queues/kagi-smallweb/enqueues'
import onError from '@modules/on-error'
import {
  createFeedListDirectory,
  prepareFeedListDiff,
  prepareParsedEntriesDiff,
  readFeedListPage,
  removeFeedListDirectory,
  type FeedListChunkSource,
} from './feed-list-temp-file.mts'

export type DispatchKagiSmallWebResult = {
  disabled?: true
  skipped?: true
  enqueued: number
  /** Candidates listed after the cursor, across every page still to come. */
  total: number
  /** True when a continuation was enqueued for the entries after this page. */
  hasMore?: true
  nextCursor?: string
  /** Set while later pages of this run still need the on-disk diff. */
  feedListDir?: string
  commitValidators?: () => Promise<void>
}

let activeFeedListDirectory: string | undefined

/**
 * One bounded page of the Small Web lists. The root downloads each changed list once. A
 * continuation resumes from that run's file and does not download or sort the lists again.
 * The cursor is the last feed URL of the page before it.
 */
export async function dispatchKagiSmallWeb(
  cursor?: string,
  pageSize = getKagiCandidateBatchSize(),
  feedListDir?: string,
): Promise<DispatchKagiSmallWebResult> {
  if (!isKagiSmallWebImportEnabled()) return { disabled: true, enqueued: 0, total: 0 }

  const existing = recordedDirectory(cursor, feedListDir)
  if (existing) return pageRecordedDirectory(existing, cursor, pageSize)

  try {
    const fetched = await fetchChangedLists(cursor)
    if (fetched.kind === 'skipped') return { skipped: true, enqueued: 0, total: 0 }
    const directory = await createFeedListDirectory()
    try {
      await prepareFeedListDiff(fetched.lists, directory)
      activeFeedListDirectory = directory
      const result = await enqueueFeedListPage(directory, cursor, pageSize, fetched.incomplete)
      if (result.hasMore) {
        return { ...result, feedListDir: directory, commitValidators: fetched.commitValidators }
      }
      await fetched.commitValidators()
      await finishFeedListDirectory(directory)
      return result
    } catch (err) {
      await finishFeedListDirectory(directory)
      throw err
    }
  } catch (err) {
    // A continuation that fails must make the next root read the lists again.
    if (cursor !== undefined)
      await forgetFeedListValidators(FEED_LIST_SOURCES.map(source => source.name))
    throw err
  }
}

/**
 * Enqueues the new entries of the next page. Callers that already hold entries share this diff.
 * @internal Tests pass an already-built list. Production streams the download.
 */
export async function dispatchKagiSmallWebPage(
  allEntries: readonly ParsedFeedEntry[],
  cursor?: string,
  options: { incomplete?: boolean; pageSize?: number } = {},
): Promise<DispatchKagiSmallWebResult> {
  const pageSize = options.pageSize ?? getKagiCandidateBatchSize()
  const directory = await createFeedListDirectory()
  try {
    await prepareParsedEntriesDiff(allEntries, directory)
    return await enqueueFeedListPage(directory, cursor, pageSize, Boolean(options.incomplete))
  } finally {
    await removeFeedListDirectory(directory)
  }
}

function recordedDirectory(
  cursor: string | undefined,
  feedListDir: string | undefined,
): string | undefined {
  if (cursor === undefined) return undefined
  const directory = feedListDir ?? activeFeedListDirectory
  return directory && existsSync(directory) ? directory : undefined
}

async function pageRecordedDirectory(
  directory: string,
  cursor: string | undefined,
  pageSize: number,
): Promise<DispatchKagiSmallWebResult> {
  try {
    const result = await enqueueFeedListPage(directory, cursor, pageSize, false)
    if (result.hasMore) return { ...result, feedListDir: directory }
    await finishFeedListDirectory(directory)
    return result
  } catch (err) {
    if (cursor !== undefined)
      await forgetFeedListValidators(FEED_LIST_SOURCES.map(source => source.name))
    throw err
  }
}

async function enqueueFeedListPage(
  directory: string,
  cursor: string | undefined,
  pageSize: number,
  incomplete: boolean,
): Promise<DispatchKagiSmallWebResult> {
  const page = await readFeedListPage(directory, cursor, pageSize)
  if (incomplete && page.total > pageSize) {
    throw new Error('A Kagi Small Web list is unavailable and more pages follow; retrying the page')
  }
  if (page.newEntries.length > 0) await enqueueBulkProcessKagiFeeds(page.newEntries)
  const hasMore = page.total > page.page.length
  return {
    enqueued: page.newEntries.length,
    total: page.total,
    ...(hasMore && { hasMore, nextCursor: page.page.at(-1)!.feedUrl }),
  }
}

async function finishFeedListDirectory(directory: string): Promise<void> {
  if (activeFeedListDirectory === directory) activeFeedListDirectory = undefined
  await removeFeedListDirectory(directory)
}

type FetchedLists =
  | { kind: 'skipped' }
  | {
      kind: 'ready'
      lists: FeedListChunkSource[]
      incomplete: boolean
      commitValidators: () => Promise<void>
    }

async function fetchChangedLists(cursor: string | undefined): Promise<FetchedLists> {
  const conditional = cursor === undefined
  const fetchResults = await Promise.allSettled(
    FEED_LIST_SOURCES.map(source => fetchFeedList(source.name, source.url, { conditional })),
  )
  const responses = fetchResults.map((result, index) => {
    if (result.status === 'rejected') {
      onError(result.reason instanceof Error ? result.reason : new Error(String(result.reason)))
      return null
    }
    return { read: result.value, source: FEED_LIST_SOURCES[index]! }
  })
  const failure = fetchResults.find(result => result.status === 'rejected')
  const missing = responses.some(response => response?.read == null)
  const changed = responses.filter(
    (response): response is { read: FeedListRead; source: (typeof FEED_LIST_SOURCES)[number] } =>
      response?.read != null,
  )
  // A page that missed a list would skip that list's entries at or below the cursor once the
  // continuation resumes, so a paged read retries whole instead of carrying on without it.
  if (changed.length === 0 && !(cursor !== undefined && missing)) {
    /* v8 ignore next -- requires all fetchFeedList calls to return 304 simultaneously; HTTP boundary tested in fetch-feed-list.mock.test.mts */
    return { kind: 'skipped' }
  }
  if (cursor !== undefined && missing) {
    throw failure?.reason instanceof Error
      ? failure.reason
      : new Error('A Kagi Small Web list is unavailable; retrying the page')
  }
  return {
    kind: 'ready',
    incomplete: Boolean(failure),
    lists: changed.map(response => ({
      chunks: response.read.stream,
      sourceType: response.source.type,
    })),
    commitValidators: async () => {
      await Promise.all(changed.map(response => response.read.commitValidators()))
    },
  }
}
