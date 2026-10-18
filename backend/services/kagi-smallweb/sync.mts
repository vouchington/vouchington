import { FEED_LIST_SOURCES } from './sources.mts'
import { fetchFeedList, forgetFeedListValidators } from './fetch-feed-list.mts'
import { parseFeedList, type ParsedFeedEntry } from './parse.mts'
import { getExistingRssFeedUrls } from './get-existing-feed-urls.mts'
import { getKagiCandidateBatchSize, isKagiSmallWebImportEnabled } from './import-config.mts'
import { enqueueBulkProcessKagiFeeds } from '@queues/kagi-smallweb/enqueues'
import onError from '@modules/on-error'

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
 * One bounded page of the Small Web lists. The first page (no cursor) only reads lists that changed
 * since the last sync; a continuation reads every list again and resumes after `cursor`, the last
 * feed URL of the page before it. Entries are ordered by feed URL so the cursor is a stable keyset.
 */
export async function dispatchKagiSmallWeb(
  cursor?: string,
  pageSize = getKagiCandidateBatchSize(),
): Promise<DispatchKagiSmallWebResult> {
  if (!isKagiSmallWebImportEnabled()) {
    return { disabled: true, enqueued: 0, total: 0 }
  }

  const conditional = cursor === undefined
  const fetchResults = await Promise.allSettled(
    FEED_LIST_SOURCES.map(source => fetchFeedList(source.name, source.url, { conditional })),
  )

  const responses = fetchResults.map((result, i) => {
    if (result.status === 'rejected') {
      onError(result.reason instanceof Error ? result.reason : new Error(String(result.reason)))
      return null
    }
    return { read: result.value, source: FEED_LIST_SOURCES[i] }
  })

  // A page that missed a list would skip that list's entries at or below the cursor once the
  // continuation resumes, so a paged read retries whole instead of carrying on without it.
  const failure = fetchResults.find(result => result.status === 'rejected')
  const missing = responses.some(r => r?.read == null)

  const changedResponses = responses.filter(r => r?.read != null)
  if (changedResponses.length === 0 && !(cursor !== undefined && missing)) {
    /* v8 ignore next -- requires all fetchFeedList calls to return 304 simultaneously; HTTP boundary tested in fetch-feed-list.mock.test.mts */
    return { skipped: true, enqueued: 0, total: 0 }
  }

  try {
    if (cursor !== undefined && missing) {
      throw failure?.reason instanceof Error
        ? failure.reason
        : new Error('A Kagi Small Web list is unavailable; retrying the page')
    }
    const allEntries = changedResponses.flatMap(r => parseFeedList(r!.read!.text, r!.source.type))
    const result = await dispatchKagiSmallWebPage(allEntries, cursor, {
      incomplete: Boolean(failure),
      pageSize,
    })
    const commitValidators = async () => {
      await Promise.all(changedResponses.map(r => r!.read!.commitValidators()))
    }
    // A root may commit its snapshot validators only after its continuation is durably admitted.
    // Later list changes (including URLs below this cursor) still differ from that snapshot.
    if (result.hasMore) return { ...result, commitValidators }
    await commitValidators()
    return result
  } catch (err) {
    // A continuation that fails must make the next root read the lists again. A root commits
    // nothing until its page is admitted, so it has nothing to undo.
    if (cursor !== undefined) {
      await forgetFeedListValidators(FEED_LIST_SOURCES.map(source => source.name))
    }
    throw err
  }
}

/** Enqueues the new entries of the next page of `allEntries` and continues after it when more remain. */
export async function dispatchKagiSmallWebPage(
  allEntries: readonly ParsedFeedEntry[],
  cursor?: string,
  options: { incomplete?: boolean; pageSize?: number } = {},
): Promise<DispatchKagiSmallWebResult> {
  const unique = new Map<string, ParsedFeedEntry>()
  for (const entry of allEntries) {
    if (cursor === undefined || entry.feedUrl > cursor) unique.set(entry.feedUrl, entry)
  }
  const remaining = [...unique.values()].toSorted((a, b) => (a.feedUrl < b.feedUrl ? -1 : 1))

  const pageSize = options.pageSize ?? getKagiCandidateBatchSize()
  if (options.incomplete && remaining.length > pageSize) {
    throw new Error('A Kagi Small Web list is unavailable and more pages follow; retrying the page')
  }
  const page = remaining.slice(0, pageSize)
  const existingUrls = await getExistingRssFeedUrls(page.map(entry => entry.feedUrl))
  const newEntries = page.filter(entry => !existingUrls.has(entry.feedUrl))

  if (newEntries.length > 0) {
    await enqueueBulkProcessKagiFeeds(newEntries)
  }

  const hasMore = remaining.length > page.length

  return {
    enqueued: newEntries.length,
    total: remaining.length,
    ...(hasMore && { hasMore, nextCursor: page.at(-1)!.feedUrl }),
  }
}
