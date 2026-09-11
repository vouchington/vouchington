import { it, expect, describe } from 'vitest'
import {
  createTestUser,
  createTestRssFeedItemWithUrl,
  insertRssFeedItemVote,
  insertTestRssFeedDirect,
} from '@voucha/test-helpers'
import { updateRssFeedItemElectionVoteStats } from '@services/elections-votes/rss-feed-item/vote-stats'
import { getRssFeedItemsByIdBatch } from '../get-batch.mts'

describe('election', () => {
  it('view_rss_feed_items omits nested election after a vote', async () => {
    const user = await createTestUser()
    const feed = await insertTestRssFeedDirect({})
    const item = await createTestRssFeedItemWithUrl(feed.id)

    await insertRssFeedItemVote(user!.id, item.id, 1)
    // Aggregate vote stats: insertRssFeedItemVote only writes the raw vote row;
    // counts and scores on rss_feed_items are maintained by the application stats updater.
    await updateRssFeedItemElectionVoteStats(item.id)

    const [result] = await getRssFeedItemsByIdBatch([item.id])

    expect(result).not.toBeNull()
    expect(result).not.toHaveProperty('election')
  })

  it('view_rss_feed_items omits nested election with no votes', async () => {
    const feed = await insertTestRssFeedDirect({})
    const item = await createTestRssFeedItemWithUrl(feed.id)

    const [result] = await getRssFeedItemsByIdBatch([item.id])

    expect(result).not.toBeNull()
    expect(result).not.toHaveProperty('election')
  })
})
