import { createHash, randomUUID } from 'node:crypto'
import { write } from '@data-stores/psql'
import { describe, expect, it } from 'vitest'
import {
  createTestUrlWithHostname,
  createTestUser,
  insertHackerNewsReferencesForTest,
  insertTestRssFeed,
  insertTestRssFeedDirect,
  insertTestRssFeedItem,
  insertTestTopic,
} from '@voucha/test-helpers'
import { getRssHackerNewsFlagStateForTest } from '@voucha/test-helpers/hacker-news-flag-state'
import { insertTestUrlDirect } from '@voucha/test-helpers/entities/urls'
import { upsertRssFeedItems } from './upsert.mts'
import { recomputeRssFeedItemHackerNewsFlags } from './hacker-news-flags.mts'

describe('RSS Hacker News flags', () => {
  it('sets and clears flags as the real RSS upsert changes the URL', async () => {
    const id = randomUUID()
    const link = `https://hn-rss-${id}.example.com/article`
    const url = await insertTestUrlDirect(null, link)
    if (!url) throw new Error('Expected URL')
    await insertHackerNewsReferencesForTest({ url_id: url.id, story_count: 1, comment_count: 0 })
    const feed = await insertTestRssFeedDirect({})
    const [created] = await upsertRssFeedItems(feed.id, [{ guid: id, link, title: 'One' }])
    if (!created) throw new Error('Expected item')
    expect(await getRssHackerNewsFlagStateForTest(created.id)).toEqual({
      stored: true,
      expected: true,
    })
    await upsertRssFeedItems(feed.id, [
      { guid: id, link: `https://hn-rss-${id}.example.com/other`, title: 'Two' },
    ])
    expect(await getRssHackerNewsFlagStateForTest(created.id)).toEqual({
      stored: false,
      expected: false,
    })
  })

  it('recomputes referenced and unreferenced item flags in a batch', async () => {
    const user = await createTestUser()
    const random = randomUUID()
    const topicId = await insertTestTopic({
      name: `HN ${random}`,
      slug: `hn-${random}`,
      createdById: user.id,
    })
    const rssFeedId = await insertTestRssFeed({ topicId, title: `HN ${random}` })
    const ids = await Promise.all([createTestUrlWithHostname(), createTestUrlWithHostname()])
    const items = await Promise.all(
      ids.map((urlId, index) =>
        insertTestRssFeedItem({
          rssFeedId,
          urlId,
          guid: `${random}-${index}`,
          itemData: { title: `HN ${random}` },
          contentSha256: createHash('sha256').update(`${random}-${index}`).digest(),
        }),
      ),
    )
    await insertHackerNewsReferencesForTest({ url_id: ids[0]!, story_count: 1, comment_count: 0 })
    const before = await write<{ updated_at: string }>(
      'SELECT updated_at::text FROM rss_feed_items WHERE id = $1',
      [items[0]],
    )
    await recomputeRssFeedItemHackerNewsFlags(items)
    const after = await write<{ updated_at: string }>(
      'SELECT updated_at::text FROM rss_feed_items WHERE id = $1',
      [items[0]],
    )
    expect(after.rows[0]?.updated_at).toEqual(before.rows[0]?.updated_at)
    await write(
      'UPDATE rss_feed_items SET data = data || \'{"title":"Changed"}\'::jsonb WHERE id = $1',
      [items[0]],
    )
    const contentUpdate = await write<{ advanced: boolean }>(
      'SELECT updated_at > $2::timestamptz AS advanced FROM rss_feed_items WHERE id = $1',
      [items[0], before.rows[0]!.updated_at],
    )
    expect(contentUpdate.rows[0]!.advanced).toBe(true)
    expect(await getRssHackerNewsFlagStateForTest(items[0]!)).toEqual({
      stored: true,
      expected: true,
    })
    expect(await getRssHackerNewsFlagStateForTest(items[1]!)).toEqual({
      stored: false,
      expected: false,
    })
    await recomputeRssFeedItemHackerNewsFlags(items)
    expect(await getRssHackerNewsFlagStateForTest(items[0]!)).toEqual({
      stored: true,
      expected: true,
    })
  })
})
