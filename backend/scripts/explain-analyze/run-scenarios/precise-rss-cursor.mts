import { read } from '@data-stores/psql'
import {
  buildRssFeedItemSearchPageInfo,
  getRssFeedItemSearchCursorScope,
  searchRssFeedItems,
} from '../run-services.mts'
import { runAndCapture } from '../run-support.mts'
import { registerScenarioContract } from '../plan-expectations.mts'

import { RSS_RECENCY_LATE_CURSOR_PAGE_SIZE } from '../seed-data/common.mts'

export async function runPreciseRssRecencyCursorScenario(): Promise<void> {
  const { rows } = await read<{ id: string; timestamp: string }>(
    `/* explainRssRecencyLateBoundary */
     SELECT items.id,
       to_char(items.published_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS timestamp
     FROM rss_feed_items items
     JOIN rss_feed_item_guids ids ON ids.id = items.id
     WHERE ids.guid = 'seed-item-guid-20000'`,
  )
  if (rows.length !== 1) throw new Error('RSS late cursor boundary must name one seeded item')
  const options = { limit: RSS_RECENCY_LATE_CURSOR_PAGE_SIZE }
  const { end_cursor: after } = buildRssFeedItemSearchPageInfo(
    [{ id: rows[0].id, cursor_published_at: rows[0].timestamp }],
    true,
    getRssFeedItemSearchCursorScope(options),
  )
  if (!after) throw new Error('RSS late cursor boundary must produce a continuation cursor')
  registerScenarioContract('rss-feed-items-search-global-late-cursor', {
    expectations: [
      { kind: 'custom', name: 'rssRecencyCursor' },
      {
        kind: 'maxProcessedRows',
        relation: 'rss_feed_items',
        max: RSS_RECENCY_LATE_CURSOR_PAGE_SIZE + 1,
      },
    ],
    crossPartition: {
      rss_feed_items: 'The published-at cursor orders RSS items across id ranges.',
    },
  })
  await runAndCapture('rss-feed-items-search-global-late-cursor', async () => {
    const result = await searchRssFeedItems({ ...options, after })
    if (result.results.length !== options.limit || !result.page_info.has_next_page) {
      throw new Error('RSS late cursor must return a full page with lookahead')
    }
  })
}
