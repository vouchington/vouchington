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
  it('walks past multiple child windows to the oldest source item', async () => {
    const viewer = await createTestUser()
    const feed = await createTestRssFeedWithTiming((await createTestTopic()).id)
    await followRssFeed(viewer, feed)
    const items = []
    const now = Date.now()
    for (const age of [8000, 6000, 4000, 2000])
      items.push(await createTestRssFeedItemWithUrl(feed, { createdAt: new Date(now - age) }))
    onTestFinished(
      overrideDynamicConfigFieldsForTest(rssFeedItemPageConfig, {
        source_limit: 1,
      }),
    )
    const options = { feed_type: 'follow_rss_feeds', time_range: 'all', limit: 1 } as const
    const walked: string[] = []
    let after: string | undefined
    for (let index = 0; index < items.length; index++) {
      const page = await getRssFeedItemFeedIds(viewer, { ...options, after })
      walked.push(...page.results.map(row => row.entity_id))
      expect(page.results).toHaveLength(1)
      expect(page.page_info.has_next_page).toBe(index < items.length - 1)
      after = page.page_info.end_cursor ?? undefined
    }
    expect(walked).toEqual(items.toReversed().map(item => item.id))
  })

  it('chooses the newest followed story member even when it is zero-net and not official', async () => {
    const viewer = await createTestUser()
    const feed = await createTestRssFeedWithTiming((await createTestTopic()).id)
    await followRssFeed(viewer, feed)
    const older = await createTestRssFeedItemWithUrl(feed, {
      createdAt: new Date(Date.now() - 8000),
    })
    const newest = await createTestRssFeedItemWithUrl(feed, {
      createdAt: new Date(Date.now() - 2000),
    })
    const story = await insertTestStory()
    for (const item of [older, newest]) await setTestItemStoryId(item.id, story.id)
    await setCandidateVotes(older.id, 100, 0)
    await setCandidateVotes(newest.id, 0, 0)
    await setCandidateOfficial(story.id, older.id)
    onTestFinished(
      overrideDynamicConfigFieldsForTest(rssFeedItemPageConfig, {
        source_limit: 1,
        story_item_limit: 1,
      }),
    )
    const options = { feed_type: 'follow_rss_feeds', time_range: 'all', limit: 10 } as const
    expect(
      (await getRssFeedItemFeedIds(viewer, options)).results.map(row => row.entity_id),
    ).toEqual([newest.id])
  })

  it('omits an old story member when newer-member probe exhaustion prevents proving a winner', async () => {
    const viewer = await createTestUser()
    const followedFeed = await createTestRssFeedWithTiming((await createTestTopic()).id)
    const outsideFeed = await createTestRssFeedWithTiming((await createTestTopic()).id)
    await followRssFeed(viewer, followedFeed)
    const now = Date.now()
    const olderFollowed = await createTestRssFeedItemWithUrl(followedFeed, {
      createdAt: new Date(now - 30_000),
    })
    const newerOutside = await Promise.all(
      [20_000, 10_000].map(age =>
        createTestRssFeedItemWithUrl(outsideFeed, { createdAt: new Date(now - age) }),
      ),
    )
    const story = await insertTestStory()
    await Promise.all(
      [olderFollowed, ...newerOutside].map(item => setTestItemStoryId(item.id, story.id)),
    )
    const restore = overrideDynamicConfigFieldsForTest(rssFeedItemPageConfig, {
      source_limit: 1,
      story_item_limit: 1,
    })
    try {
      const page = await getRssFeedItemFeedIds(viewer, {
        feed_type: 'follow_rss_feeds',
        time_range: 'all',
        limit: 10,
      })
      expect(page.results).toEqual([])
      expect(page.page_info.has_next_page).toBe(false)
    } finally {
      restore()
    }
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
