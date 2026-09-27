import { read } from '@data-stores/psql'
import { encodeScopedPreciseTimestampCursor } from '../../../modules/pagination/index.mts'
import { getRssFeedItemSearchCursorScope } from '../../../services/rss-feed-items/search-cursor.mts'
import { searchRssFeedItems } from '../run-services.mts'
import { runAndCapture } from '../run-support.mts'

import { RSS_RECENCY_LATE_CURSOR_PAGE_SIZE } from '../seed-data/common.mts'

export async function runPreciseRssRecencyCursorScenario(): Promise<void> {
  const { rows } = await read<{ id: string; timestamp: string }>(
    `/* explainRssRecencyLateBoundary */
     SELECT items.id,
       to_char(items.published_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS timestamp
     FROM rss_feed_items items
     JOIN rss_feed_item_ids ids ON ids.id = items.id
     WHERE ids.guid = 'seed-item-guid-20000'`,
  )
  if (rows.length !== 1) throw new Error('RSS late cursor boundary must name one seeded item')
  const options = { limit: RSS_RECENCY_LATE_CURSOR_PAGE_SIZE }
  const after = encodeScopedPreciseTimestampCursor(
    rows[0].timestamp,
    rows[0].id,
    getRssFeedItemSearchCursorScope(options),
  )
  await runAndCapture('rss-feed-items-search-global-late-cursor', async () => {
    const result = await searchRssFeedItems({ ...options, after })
    if (result.results.length !== options.limit || !result.page_info.has_next_page) {
      throw new Error('RSS late cursor must return a full page with lookahead')
    }
  })
}
