import { FEED_LIST_SOURCES } from './sources.mts'
import { fetchFeedList, forgetFeedListValidators, type FeedListRead } from './fetch-feed-list.mts'
import { getKagiCandidateBatchSize, isKagiSmallWebImportEnabled } from './import-config.mts'
import { enqueueBulkProcessKagiFeeds } from '@queues/kagi-smallweb/enqueues'
import onError from '@modules/on-error'
import {
  createFeedListDirectory,
  prepareFeedListDiff,
  readFeedListPage,
  removeFeedListDirectory,
  sweepExpiredFeedListDirectories,
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
  commitValidators?: () => Promise<void>
}

/**
 * One bounded page of the Small Web lists. Each run re-fetches the lists and resumes from
 * `cursor`, the last feed URL of the page before it. The on-disk diff lives only for this call.
 */
export async function dispatchKagiSmallWeb(
  cursor?: string,
  pageSize = getKagiCandidateBatchSize(),
): Promise<DispatchKagiSmallWebResult> {
  await sweepExpiredFeedListDirectories()
  if (!isKagiSmallWebImportEnabled()) return { disabled: true, enqueued: 0, total: 0 }

  try {
    const fetched = await fetchChangedLists(cursor)
    if (fetched.kind === 'skipped') return { skipped: true, enqueued: 0, total: 0 }
    let directory: string | undefined
    try {
      directory = await createFeedListDirectory()
      const result = await stageFeedListPage(
        fetched.lists,
        directory,
        cursor,
        pageSize,
        fetched.incomplete,
      )
      if (result.hasMore) return { ...result, commitValidators: fetched.commitValidators }
      await fetched.commitValidators()
      return result
    } finally {
      if (directory !== undefined) await removeFeedListDirectory(directory)
      for (const list of fetched.lists) list.chunks.destroy()
    }
  } catch (err) {
    // A continuation that fails must make the next root read the lists again.
    if (cursor !== undefined)
      await forgetFeedListValidators(FEED_LIST_SOURCES.map(source => source.name))
    throw err
  }
}

async function stageFeedListPage(
  lists: FeedListChunkSource[],
  directory: string,
  cursor: string | undefined,
  pageSize: number,
  incomplete: boolean,
): Promise<DispatchKagiSmallWebResult> {
  await prepareFeedListDiff(lists, directory)
  return enqueueFeedListPage(directory, cursor, pageSize, incomplete)
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
  let returnedStreams = false
  try {
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
    returnedStreams = true
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
  } finally {
    if (!returnedStreams) for (const response of changed) response.read.stream.destroy()
  }
}
