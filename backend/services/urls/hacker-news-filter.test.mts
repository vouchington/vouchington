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
import { seedTwoHopCanonicalForTest } from '@voucha/test-helpers/hacker-news-references'
import { getPostIds } from '../posts/search/get-ids.mts'
import { searchRssFeedItems } from '../rss-feed-items/search.mts'
import {
  getPostHackerNewsDetails,
  getPostHackerNewsSummaries,
  getRssFeedItemHackerNewsSummaries,
} from './hacker-news-sidecars.mts'
import { setCanonicalUrl } from './set-canonical.mts'

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

describe('references stored on a canonical URL', () => {
  async function pointAtCanonical(hops: 1 | 2) {
    const [source, middle, canonical] = await Promise.all([
      createTestUrlWithHostname(),
      createTestUrlWithHostname(),
      createTestUrlWithHostname(),
    ])
    await insertHackerNewsReferencesForTest({
      ...lookup(canonical, 2, 1),
      stories: [{ hacker_news_item_id: 77, points: 5, reply_count: 1, posted_at: '2026-01-01' }],
    })
    if (hops === 1) {
      await setCanonicalUrl(source, canonical)
    } else {
      // setCanonicalUrl flattens; a concurrent call can leave this two-hop chain.
      await seedTwoHopCanonicalForTest(source, middle, canonical)
    }
    return source
  }

  it.each([1, 2] as const)('shows and filters a post on a %i-hop non-canonical row', async hops => {
    const user = await createTestUser()
    const source = await pointAtCanonical(hops)
    const [post, plain] = await Promise.all([
      createTestPost({ user, url_id: source, post_type: 'link' }),
      createTestPost({ user }),
    ])
    const page = await getPostIds(undefined, {
      user_id: user!.id,
      has_hacker_news_references: true,
    })
    const ids = page.results.map(r => r.id)
    expect(ids).toContain(post.id)
    expect(ids).not.toContain(plain.id)
    expect((await getPostHackerNewsSummaries([post.id]))[post.id]).toEqual({
      story_count: 2,
      comment_count: 1,
    })
    expect((await getPostHackerNewsDetails([post.id]))[post.id]?.stories).toHaveLength(1)
  })

  it('shows and filters an RSS item on a non-canonical row', async () => {
    const user = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 8)
    const topicId = await insertTestTopic({
      name: `HN Canon ${random}`,
      slug: `hn-canon-${random}`,
      createdById: user!.id,
    })
    const feedId = await insertTestRssFeed({ topicId, title: `HN Canon Feed ${random}` })
    const source = await pointAtCanonical(1)
    const item = await insertTestRssFeedItem({
      rssFeedId: feedId,
      urlId: source,
      guid: `hn-canon-${random}`,
      itemData: { title: `HN Canon Item ${random}` },
      contentSha256: createHash('sha256').update(`hn-canon-${random}`).digest(),
    })
    const page = await searchRssFeedItems({
      rss_feed_ids: [feedId],
      has_hacker_news_references: true,
    })
    expect(page.results.map(r => r.id)).toEqual([item])
    expect(await getRssFeedItemHackerNewsSummaries([{ id: item, url: { id: source } }])).toEqual({
      [item]: { story_count: 2, comment_count: 1 },
    })
  })
})
