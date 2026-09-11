import { beginTransaction } from '@data-stores/psql'
import { seedUuid } from './common.mts'

// rss-feed-search-disabled needs a real feed whose LATEST enablement state is FALSE.
// seedRssFeeds already bulk-seeds an initial TRUE row for every feed, so add one later FALSE
// row for the last feed index — its later id/timestamp makes it the current state.
export async function seedDisabledRssFeed(feedCount = 2500): Promise<void> {
  console.log('Seeding a disabled RSS feed for the search-disabled scenario...')
  {
    await using transaction = await beginTransaction()
    const query = transaction
    await query(
      `/* seedExplainData */ INSERT INTO rss_feed_enablement_changes (rss_feed_id, enabled, reason)
       VALUES ($1, FALSE, 'explain seed disabled fixture')`,
      [seedUuid(feedCount - 1, '08')],
    )

    await transaction.commit()
  }
}
