import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createTestPost,
  createTestUrlWithHostname,
  createTestUser,
  insertHackerNewsReferencesForTest,
  insertTestRssFeed,
  insertTestRssFeedItem,
  insertTestTopic,
} from '@voucha/test-helpers'
import { createEntityRelationWithElection } from '@voucha/test-helpers/entities/dispatch'
import { getPostIds } from '../posts/search/get-ids.mts'
import { searchRssFeedItems } from '../rss-feed-items/search.mts'
import {
  getPostHackerNewsDetails,
  getRssFeedItemHackerNewsSummaries,
} from './hacker-news-sidecars.mts'

const lookup = (url_id: string, story_count: number, comment_count: number) => ({
  url_id,
  story_count,
  comment_count,
})

describe('has_hacker_news_references', () => {
  it('filters RSS feed items by their URL and exposes counts by item id', async () => {
    const user = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 8)
    const topicId = await insertTestTopic({
      name: `HN Topic ${random}`,
      slug: `hn-topic-${random}`,
      createdById: user!.id,
    })
    const feedId = await insertTestRssFeed({ topicId, title: `HN Feed ${random}` })
    const [seenUrl, plainUrl] = await Promise.all([
      createTestUrlWithHostname(),
      createTestUrlWithHostname(),
    ])
    const [seen, plain] = await Promise.all(
      [seenUrl, plainUrl].map((urlId, i) =>
        insertTestRssFeedItem({
          rssFeedId: feedId,
          urlId,
          guid: `hn-${random}-${i}`,
          itemData: { title: `HN Item ${random} ${i}` },
          contentSha256: createHash('sha256').update(`hn-${random}-${i}`).digest(),
        }),
      ),
    )
    await Promise.all([
      insertHackerNewsReferencesForTest(lookup(seenUrl, 1, 0)),
      insertHackerNewsReferencesForTest(lookup(plainUrl, 0, 0)),
    ])

    const withRefs = await searchRssFeedItems({
      rss_feed_ids: [feedId],
      has_hacker_news_references: true,
    })
    const without = await searchRssFeedItems({
      rss_feed_ids: [feedId],
      has_hacker_news_references: false,
    })
    expect(withRefs.results.map(r => r.id)).toEqual([seen])
    expect(without.results.map(r => r.id)).toEqual([plain])
    expect(
      await getRssFeedItemHackerNewsSummaries([
        { id: seen, url: { id: seenUrl } },
        { id: plain, url: { id: plainUrl } },
      ]),
    ).toEqual({ [seen]: { story_count: 1, comment_count: 0 } })
  })

  it('matches a post through its link URL or a positively voted related URL', async () => {
    const user = await createTestUser()
    const [relatedUrl, otherUrl] = await Promise.all([
      createTestUrlWithHostname(),
      createTestUrlWithHostname(),
    ])
    const [viaRelation, unrelated] = await Promise.all([
      createTestPost({ user }),
      createTestPost({ user }),
    ])
    await createEntityRelationWithElection(viaRelation.id, relatedUrl, user!.id, 1)
    await createEntityRelationWithElection(unrelated.id, otherUrl, user!.id, 1)
    await Promise.all([
      insertHackerNewsReferencesForTest(lookup(relatedUrl, 0, 2)),
      insertHackerNewsReferencesForTest(lookup(otherUrl, 0, 0)),
    ])

    const page = await getPostIds(undefined, {
      user_id: user!.id,
      has_hacker_news_references: true,
    })
    expect(page.results.map(r => r.id)).toEqual([viaRelation.id])
    expect(Object.keys(await getPostHackerNewsDetails([viaRelation.id, unrelated.id]))).toEqual([
      viaRelation.id,
    ])
  })
})
