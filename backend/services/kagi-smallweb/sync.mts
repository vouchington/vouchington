import { FEED_LIST_SOURCES } from './sources.mts'
import { fetchFeedList } from './fetch-feed-list.mts'
import { parseFeedList } from './parse.mts'
import { getExistingRssFeedUrls } from './get-existing-feed-urls.mts'
import { isKagiSmallWebImportEnabled } from './import-config.mts'
import { enqueueBulkProcessKagiFeeds } from '@queues/kagi-smallweb/enqueues'
import onError from '@modules/on-error'

export type DispatchKagiSmallWebResult = {
  disabled?: true
  skipped?: true
  enqueued: number
  total: number
}

export async function dispatchKagiSmallWeb(): Promise<DispatchKagiSmallWebResult> {
  if (!isKagiSmallWebImportEnabled()) {
    return { disabled: true, enqueued: 0, total: 0 }
  }

  const fetchResults = await Promise.allSettled(
    FEED_LIST_SOURCES.map(source => fetchFeedList(source.name, source.url)),
  )

  const responses = fetchResults.map((result, i) => {
    if (result.status === 'rejected') {
      onError(result.reason instanceof Error ? result.reason : new Error(String(result.reason)))
      return null
    }
    return { text: result.value, source: FEED_LIST_SOURCES[i] }
  })

  const changedResponses = responses.filter(r => r?.text != null)
  if (changedResponses.length === 0) {
    /* v8 ignore next -- requires all fetchFeedList calls to return 304 simultaneously; HTTP boundary tested in fetch-feed-list.mock.test.mts */
    return { skipped: true, enqueued: 0, total: 0 }
  }

  const allEntries = changedResponses.flatMap(r => parseFeedList(r!.text!, r!.source.type))

  const existingUrls = await getExistingRssFeedUrls()
  const newEntries = allEntries.filter(entry => !existingUrls.has(entry.feedUrl))

  /* v8 ignore start -- enabled-with-content path requires live HTTP to raw.githubusercontent.com; would enqueue hundreds of real feeds in Valkey */
  if (newEntries.length > 0) {
    await enqueueBulkProcessKagiFeeds(newEntries)
  }

  return { enqueued: newEntries.length, total: allEntries.length }
  /* v8 ignore stop */
}
