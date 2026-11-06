import { describe, expect, it, onTestFinished } from 'vitest'
import {
  createTestRssFeedItemWithUrl,
  createTestRssFeedWithTiming,
  createTestTopic,
  createTestUser,
  followRssFeed,
  hideRssFeedItem,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { insertTestStory, setTestItemStoryId } from '@voucha/test-helpers/entities/stories'
import {
  setCandidateOfficial,
  setCandidateVotes,
  setCandidatePublication,
} from '@voucha/test-helpers/rss-feed-candidates'
import { getRssFeedItemFeedIds } from '../get-ids.mts'
import { rssFeedItemPageConfig } from '../feed-page-config.mts'

describe('bounded personalized RSS candidates', () => {
  it('keeps a fixed two-item source pool across strict cursor pages', async () => {
    const viewer = await createTestUser()
    const feed = await createTestRssFeedWithTiming((await createTestTopic()).id)
    await followRssFeed(viewer, feed)
    const items = []
    const now = Date.now()
    for (const age of [6000, 4000, 2000])
      items.push(await createTestRssFeedItemWithUrl(feed, { createdAt: new Date(now - age) }))
    onTestFinished(
      overrideDynamicConfigFieldsForTest(rssFeedItemPageConfig, {
        source_limit: 1,
        items_per_source: 2,
      }),
    )
    const options = { feed_type: 'follow_rss_feeds', time_range: 'all', limit: 1 } as const
    const first = await getRssFeedItemFeedIds(viewer, options)
    expect(first.results.map(row => row.entity_id)).toEqual([items[2]!.id])
    expect(first.page_info.has_next_page).toBe(true)
    const second = await getRssFeedItemFeedIds(viewer, {
      ...options,
      after: first.page_info.end_cursor!,
    })
    expect(second.results.map(row => row.entity_id)).toEqual([items[1]!.id])
    expect(second.page_info.has_next_page).toBe(false)
    const pool = await getRssFeedItemFeedIds(viewer, { ...options, limit: 10 })
    expect(pool.results.map(row => row.entity_id)).toEqual([items[2]!.id, items[1]!.id])
  })

  it('finds official first within a one-child story cap, then ranks positive candidates by Wilson score', async () => {
    const viewer = await createTestUser()
    const feed = await createTestRssFeedWithTiming((await createTestTopic()).id)
    await followRssFeed(viewer, feed)
    const highNet = await createTestRssFeedItemWithUrl(feed)
    const highWilson = await createTestRssFeedItemWithUrl(feed)
    const official = await createTestRssFeedItemWithUrl(feed)
    const story = await insertTestStory()
    for (const item of [highNet, highWilson, official]) await setTestItemStoryId(item.id, story.id)
    await setCandidateVotes(highNet.id, 100, 90)
    await setCandidateVotes(highWilson.id, 6, 0)
    await setCandidateVotes(official.id, 1, 0)
    await setCandidateOfficial(story.id, official.id)
    onTestFinished(
      overrideDynamicConfigFieldsForTest(rssFeedItemPageConfig, {
        source_limit: 1,
        items_per_source: 3,
        story_item_limit: 1,
      }),
    )
    const options = { feed_type: 'follow_rss_feeds', time_range: 'all', limit: 10 } as const
    expect(
      (await getRssFeedItemFeedIds(viewer, options)).results.map(row => row.entity_id),
    ).toEqual([official.id])
    await setCandidateOfficial(story.id, null)
    expect(
      (await getRssFeedItemFeedIds(viewer, options)).results.map(row => row.entity_id),
    ).toEqual([highWilson.id])
    await setCandidateOfficial(story.id, highWilson.id)
    await setCandidateVotes(highWilson.id, 6, 10)
    expect(
      (await getRssFeedItemFeedIds(viewer, options)).results.map(row => row.entity_id),
    ).toEqual([highNet.id])
  })

  it('suppresses an over-budget hide set rather than exposing an unchecked hidden item', async () => {
    const viewer = await createTestUser()
    const feed = await createTestRssFeedWithTiming((await createTestTopic()).id)
    await followRssFeed(viewer, feed)
    const visible = await createTestRssFeedItemWithUrl(feed)
    const firstHidden = await createTestRssFeedItemWithUrl(feed)
    const secondHidden = await createTestRssFeedItemWithUrl(feed)
    onTestFinished(
      overrideDynamicConfigFieldsForTest(rssFeedItemPageConfig, { exclusion_relation_limit: 1 }),
    )
    await hideRssFeedItem(viewer, firstHidden)
    const options = { feed_type: 'follow_rss_feeds', time_range: 'all', limit: 10 } as const
    expect(
      (await getRssFeedItemFeedIds(viewer, options)).results.map(row => row.entity_id),
    ).toContain(visible.id)
    await hideRssFeedItem(viewer, secondHidden)
    const page = await getRssFeedItemFeedIds(viewer, options)
    expect(page.results).toEqual([])
    expect(page.page_info.has_next_page).toBe(false)
  })
  it('checks canonical dates while bounded projections await repair', async () => {
    const viewer = await createTestUser()
    const feed = await createTestRssFeedWithTiming((await createTestTopic()).id)
    await followRssFeed(viewer, feed)
    const item = await createTestRssFeedItemWithUrl(feed)
    const options = { feed_type: 'follow_rss_feeds', time_range: '1m', limit: 10 } as const
    expect(
      (await getRssFeedItemFeedIds(viewer, options)).results.map(row => row.entity_id),
    ).toEqual([item.id])
    await setCandidatePublication(item.id, new Date(Date.now() - 40 * 24 * 60 * 60_000))
    expect((await getRssFeedItemFeedIds(viewer, options)).results).toEqual([])
  })
})
