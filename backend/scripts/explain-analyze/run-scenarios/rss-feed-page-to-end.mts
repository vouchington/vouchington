import type { RssFeedItemFeedOptions, RssFeedItemFeedResponse } from '@services/feeds/types'
import { getRssFeedItemsWorkLimit } from '@services/rss-feed-items/work-limits'
import type { PrivateUser } from '@services/users/types'
import { SEEDED_ROWS_BY_RELATION } from '../plan-seeded-rows.mts'
import { withSeedAnchorClock } from '../seed-clock.mts'
import { runAndCapture } from '../run-support.mts'
import { getRssFeedItemFeedIds } from '../run-services.mts'

type FeedRead = (options: RssFeedItemFeedOptions) => Promise<RssFeedItemFeedResponse>

export type PagedFeed = {
  readonly results: RssFeedItemFeedResponse['results']
  readonly pages: number
  readonly last: RssFeedItemFeedResponse
}

/**
 * Each page inspects at most the configured cap per arm, so a feed over the seeded corpus ends
 * within ceil(corpus / cap) pages plus the closing page.
 */
export function maxPagesForSeededCorpus(): number {
  const cap = getRssFeedItemsWorkLimit('feed_candidate_inspection_cap')
  return Math.ceil(SEEDED_ROWS_BY_RELATION.rss_feed_items! / cap) + 1
}

/** Follows `has_next_page` and the returned cursor through the real read, for a fixed page count. */
export async function pageRssFeedToEnd(
  first: RssFeedItemFeedResponse,
  options: RssFeedItemFeedOptions,
  read: FeedRead,
): Promise<PagedFeed> {
  const maxPages = maxPagesForSeededCorpus()
  const results = [...first.results]
  let last = first
  let pages = 1
  for (
    ;
    pages < maxPages && last.page_info.has_next_page && last.page_info.end_cursor;
    pages += 1
  ) {
    const after = last.page_info.end_cursor
    last = await withSeedAnchorClock(() => read({ ...options, after }))
    results.push(...last.results)
  }
  if (last.page_info.has_next_page)
    throw new Error(`RSS feed still had a next page after ${maxPages} pages`)
  return { results, pages, last }
}

/** Captures the first page for EXPLAIN, then pages the same read to the end outside the capture. */
export async function captureFirstPageAndPageToEnd(
  scenarioId: string,
  user: PrivateUser,
  options: RssFeedItemFeedOptions,
): Promise<PagedFeed> {
  let first: RssFeedItemFeedResponse | undefined
  await runAndCapture(scenarioId, async () => {
    first = await getRssFeedItemFeedIds(user, options)
  })
  if (!first) throw new Error(`${scenarioId} captured no first page`)
  return pageRssFeedToEnd(first, options, next => getRssFeedItemFeedIds(user, next))
}
