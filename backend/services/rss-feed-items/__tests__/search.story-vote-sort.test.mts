import { describe, expect, it } from 'vitest'
import {
  insertTestStory,
  setTestItemStoryId,
  insertTestRssFeedDirect,
  setTestRssFeedItemVotes,
} from '@voucha/test-helpers'
import { getRssFeedItemKeyByGuid } from '@voucha/test-helpers/rss-feed-item-guid-lookup'
import { searchRssFeedItems } from '../search.mts'
import { upsertRssFeedItems } from '../upsert.mts'

describe('RSS item story representative ranking', () => {
  it('chooses the story representative by Wilson score rather than net votes', async () => {
    const feed = await insertTestRssFeedDirect({})
    const random = Math.random().toString(36).slice(2, 15)
    const guids = [`wilson-${random}`, `net-${random}`]
    await upsertRssFeedItems(
      feed.id,
      guids.map(guid => ({
        link: `https://example.com/${guid}`,
        guid,
        title: guid,
        pubDate: '2025-06-01T00:00:00Z',
      })),
    )
    const [wilson, net] = await Promise.all(guids.map(guid => getRssFeedItemKeyByGuid(guid)))
    const story = await insertTestStory()
    await Promise.all([
      setTestItemStoryId(wilson!.id, story.id),
      setTestItemStoryId(net!.id, story.id),
      setTestRssFeedItemVotes(wilson!.id, 5),
      setTestRssFeedItemVotes(net!.id, 100, 90),
    ])
    const page = await searchRssFeedItems({ rss_feed_ids: [feed.id], limit: 10 })
    expect(page.results.map(item => item.id)).toEqual([wilson!.id])
  })
})
