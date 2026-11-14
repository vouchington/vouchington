import { valkeyEvents } from 'valkyries'
import { serializeSearchCacheKey } from '@services/entity-cache/search-cache'
import { getAnonymousCacheGeneration } from '@services/entity-cache/anonymous-cache-generation'
import {
  POST_IDS_ANON_CACHE,
  RSS_FEED_ITEMS_ANON_CACHE,
} from '@services/entity-cache/anonymous-search-prefixes'
import { setHackerNewsReferenceFlagsForTest } from '@voucha/test-helpers/hacker-news-references'
import { getPostIdsCached, searchRssFeedItemsCached } from '../entity-fetch/search-caches.mts'
import { createHash } from 'node:crypto'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { hackerNewsVisibilityConfig } from './hacker-news-visibility-config.mts'
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
  getPostHackerNewsSummaries,
  getRssFeedItemHackerNewsSummaries,
} from './hacker-news-sidecars.mts'
import { setCanonicalUrl } from './set-canonical.mts'

async function readStoredSnapshot<T>(
  prefix: string,
  options: object,
  read: () => Promise<T>,
): Promise<T> {
  // Search snapshots are keyed by the anonymous legal generation, which a concurrent legal
  // removal may advance during the read, so accept the key from either side of it.
  const keys = new Set([
    serializeSearchCacheKey({ generation: await getAnonymousCacheGeneration(), options }),
  ])
  const storedKeys = new Set<string>()
  const stored = Promise.withResolvers<void>()
  const onSet = (event: { cacheName: string; keys: string[] }) => {
    if (event.cacheName !== prefix) return
    for (const key of event.keys) storedKeys.add(key)
    if (event.keys.some(key => keys.has(key))) stored.resolve()
  }
  valkeyEvents.on('cache:set', onSet)
  try {
    const result = await read()
    keys.add(serializeSearchCacheKey({ generation: await getAnonymousCacheGeneration(), options }))
    if ([...keys].some(key => storedKeys.has(key))) stored.resolve()
    await stored.promise
    return result
  } finally {
    valkeyEvents.off('cache:set', onSet)
  }
}

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

    await setHackerNewsReferenceFlagsForTest([], [seen])

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
    for (const filter of [true, false]) {
      const options = { rss_feed_ids: [feedId], has_hacker_news_references: filter }
      const snapshot = await readStoredSnapshot(RSS_FEED_ITEMS_ANON_CACHE, options, () =>
        searchRssFeedItemsCached(options),
      )
      expect(snapshot.results.map(row => row.id)).toEqual([filter ? seen : plain])
    }
    const restore = overrideDynamicConfigFieldsForTest(hackerNewsVisibilityConfig, {
      references_visible: false,
    })
    try {
      for (const filter of [true, false]) {
        const options = { rss_feed_ids: [feedId], has_hacker_news_references: filter }
        const cached = await searchRssFeedItemsCached(options)
        expect(cached.results.map(row => row.id)).toEqual([filter ? seen : plain])
        const canonical = await searchRssFeedItems(options)
        expect(canonical.results.map(row => row.id).toSorted()).toEqual([seen, plain].toSorted())
      }
      expect(await getRssFeedItemHackerNewsSummaries([{ id: seen, url: { id: seenUrl } }])).toEqual(
        {},
      )
    } finally {
      restore()
    }

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

    await setHackerNewsReferenceFlagsForTest([viaRelation.id], [])

    const page = await getPostIds(undefined, {
      user_id: user!.id,
      has_hacker_news_references: true,
    })
    expect(page.results.map(r => r.id)).toEqual([viaRelation.id])
    for (const filter of [true, false]) {
      const options = { user_id: user!.id, has_hacker_news_references: filter }
      const snapshot = await readStoredSnapshot(POST_IDS_ANON_CACHE, options, () =>
        getPostIdsCached(options),
      )
      expect(snapshot.results.map(row => row.id)).toEqual([filter ? viaRelation.id : unrelated.id])
    }
    const restore = overrideDynamicConfigFieldsForTest(hackerNewsVisibilityConfig, {
      references_visible: false,
    })
    try {
      for (const filter of [true, false]) {
        const options = { user_id: user!.id, has_hacker_news_references: filter }
        const cached = await getPostIdsCached(options)
        expect(cached.results.map(row => row.id)).toEqual([filter ? viaRelation.id : unrelated.id])
        const canonical = await getPostIds(undefined, options)
        expect(canonical.results.map(row => row.id).toSorted()).toEqual(
          [viaRelation.id, unrelated.id].toSorted(),
        )
      }
      expect(await getPostHackerNewsDetails([viaRelation.id])).toEqual({})
    } finally {
      restore()
    }

    expect(Object.keys(await getPostHackerNewsDetails([viaRelation.id, unrelated.id]))).toEqual([
      viaRelation.id,
    ])
  })
})

describe('references stored on a canonical URL', () => {
  async function pointAtCanonical() {
    const [source, canonical] = await Promise.all([
      createTestUrlWithHostname(),
      createTestUrlWithHostname(),
    ])
    await insertHackerNewsReferencesForTest({
      ...lookup(canonical, 2, 1),
      stories: [{ hacker_news_item_id: 77, points: 5, reply_count: 1, posted_at: '2026-01-01' }],
    })
    await setCanonicalUrl(source, canonical)
    return source
  }

  it('shows and filters a post on a non-canonical row', async () => {
    const user = await createTestUser()
    const source = await pointAtCanonical()
    const [post, plain] = await Promise.all([
      createTestPost({ user, url_id: source, post_type: 'link' }),
      createTestPost({ user }),
    ])
    await setHackerNewsReferenceFlagsForTest([post.id], [])
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
    const source = await pointAtCanonical()
    const item = await insertTestRssFeedItem({
      rssFeedId: feedId,
      urlId: source,
      guid: `hn-canon-${random}`,
      itemData: { title: `HN Canon Item ${random}` },
      contentSha256: createHash('sha256').update(`hn-canon-${random}`).digest(),
    })
    await setHackerNewsReferenceFlagsForTest([], [item])
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
